import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Database, InjectDb } from '../db/db.module';
import {
  employees,
  organizations,
  trainingExamAnswers,
  trainingExamAttempts,
  trainingGroups,
  trainingParticipants,
  trainingQuestions,
  trainings,
  trainingTopics,
} from '../db/schema';
import { TraineeToken } from './portal-auth.service';
import { TestType } from './trainings.service';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Participant = typeof trainingParticipants.$inferSelect;
export type Step = 'pretest' | 'topic' | 'posttest' | 'completed';

/** Sayfa geçişinde ağ gecikmesi için tanınan pay (saniye). */
const READ_TOLERANCE_SECONDS = 2;

/**
 * Katılımcının eğitim akışı: ön test → alt konular (her biri en az okuma süresi kadar gösterilir) → son test.
 * Tüm kurallar sunucuda uygulanır; tarayıcıdaki sayaç yalnızca gösterim içindir.
 */
@Injectable()
export class PortalService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Katılımcıya gönderilmiş eğitimler (aynı e-postayla kayıtlı tüm kuruluşlardaki). */
  async assignments(token: TraineeToken) {
    const rows = await this.db
      .select({
        id: trainingParticipants.id,
        trainingName: trainings.name,
        groupName: trainingGroups.name,
        organizationName: organizations.name,
        sentAt: trainingParticipants.sentAt,
        startedAt: trainingParticipants.startedAt,
        completedAt: trainingParticipants.completedAt,
      })
      .from(trainingParticipants)
      .innerJoin(employees, eq(employees.id, trainingParticipants.employeeId))
      .innerJoin(trainingGroups, eq(trainingGroups.id, trainingParticipants.groupId))
      .innerJoin(trainings, eq(trainings.id, trainingGroups.trainingId))
      .innerJoin(organizations, eq(organizations.id, trainingGroups.organizationId))
      .where(and(sql`lower(${employees.email}) = lower(${token.email})`, isNotNull(trainingParticipants.sentAt)))
      .orderBy(desc(trainingParticipants.sentAt));
    return rows;
  }

  /**
   * Eğitimin şu anki adımı. Katılımcı bu oturumda eğitime ilk kez giriyorsa konu ilerlemesi sıfırlanır
   * (eğitimi bitirmeden çıkan katılımcı için eğitim baştan başlar).
   */
  async view(token: TraineeToken, participantId: string) {
    return this.db.transaction(async (tx) => {
      const ctx = await this.load(tx, token, participantId);
      return this.present(tx, ctx);
    });
  }

  /** Okuma süresi dolduysa sonraki alt konuya (son konudan sonra son teste) geçer. */
  async next(token: TraineeToken, participantId: string, topicIndex: number) {
    return this.db.transaction(async (tx) => {
      const ctx = await this.load(tx, token, participantId);
      if (ctx.step !== 'topic') throw new ConflictException('Şu anda ders konusu adımında değilsiniz');
      const p = ctx.participant;
      if (topicIndex !== p.currentTopicIndex) throw new ConflictException('Sayfa güncel değil; lütfen sayfayı yenileyin');
      const topic = ctx.topics[p.currentTopicIndex];
      const remaining = this.remainingSeconds(p, topic.minReadSeconds);
      if (remaining > READ_TOLERANCE_SECONDS) {
        throw new BadRequestException(`Bu konu için ${remaining} saniye daha okumanız gerekiyor`);
      }
      const now = new Date();
      const last = p.currentTopicIndex >= ctx.topics.length - 1;
      const [updated] = await tx
        .update(trainingParticipants)
        .set(last ? { topicsCompletedAt: now } : { currentTopicIndex: p.currentTopicIndex + 1, topicStartedAt: now })
        .where(eq(trainingParticipants.id, p.id))
        .returning();
      return this.present(tx, { ...ctx, participant: updated, step: last ? 'posttest' : 'topic' });
    });
  }

  /** Ön testi veya son testi tek seferde teslim eder; tüm sorular cevaplanmalıdır. */
  async submit(token: TraineeToken, participantId: string, testType: TestType, answers: Record<string, string>) {
    return this.db.transaction(async (tx) => {
      const ctx = await this.load(tx, token, participantId);
      const expected: Step = testType === 'pre' ? 'pretest' : 'posttest';
      if (ctx.step !== expected) throw new ConflictException('Bu sınav şu anda çözülemez; lütfen sayfayı yenileyin');
      const questions = ctx.questions.filter((q) => q.testType === testType);
      const unanswered = questions.filter((q) => !answers[q.id]).length;
      if (unanswered) throw new BadRequestException(`Cevaplanmamış ${unanswered} soru var`);
      const known = new Set(questions.map((q) => q.id));
      if (Object.keys(answers).some((id) => !known.has(id))) throw new BadRequestException('Geçersiz soru');

      const graded = questions.map((q) => {
        const isCorrect = answers[q.id] === q.correctOption;
        return { questionId: q.id, answer: answers[q.id] as 'A' | 'B' | 'C' | 'D', isCorrect, points: isCorrect ? q.points : 0 };
      });
      const score = graded.reduce((s, g) => s + g.points, 0);
      const passed = testType === 'post' ? score >= ctx.passScore : null;
      const [attempt] = await tx
        .insert(trainingExamAttempts)
        .values({ participantId, testType, score, passed })
        .returning({ id: trainingExamAttempts.id });
      await tx.insert(trainingExamAnswers).values(graded.map((g) => ({ ...g, attemptId: attempt.id })));

      const now = new Date();
      let update: Partial<Participant>;
      if (testType === 'pre') {
        update = this.restart(token.sid, now);
      } else if (passed) {
        update = { completedAt: now };
      } else {
        // Başarısız: konular yeniden okunup son test tekrar çözülür.
        update = this.restart(token.sid, now);
      }
      const [updated] = await tx
        .update(trainingParticipants)
        .set(update)
        .where(eq(trainingParticipants.id, participantId))
        .returning();
      const step: Step = testType === 'post' && passed ? 'completed' : 'topic';
      return { score, passed, ...(await this.present(tx, { ...ctx, participant: updated, step })) };
    });
  }

  private restart(sid: string, now: Date): Partial<Participant> {
    return { progressSessionId: sid, currentTopicIndex: 0, topicStartedAt: now, topicsCompletedAt: null };
  }

  private remainingSeconds(p: Participant, minReadSeconds: number) {
    const elapsed = p.topicStartedAt ? (Date.now() - p.topicStartedAt.getTime()) / 1000 : 0;
    return Math.max(0, Math.ceil(minReadSeconds - elapsed));
  }

  /** Katılımcı kaydını kilitleyerek yükler ve adımı belirler (gerekirse ilerlemeyi bu oturum için sıfırlar). */
  private async load(tx: Tx, token: TraineeToken, participantId: string) {
    const [row] = await tx
      .select({ participant: trainingParticipants, email: employees.email, trainingId: trainingGroups.trainingId })
      .from(trainingParticipants)
      .innerJoin(employees, eq(employees.id, trainingParticipants.employeeId))
      .innerJoin(trainingGroups, eq(trainingGroups.id, trainingParticipants.groupId))
      .where(eq(trainingParticipants.id, participantId))
      .for('update', { of: trainingParticipants });
    if (!row || !row.participant.sentAt || row.email?.toLowerCase() !== token.email.toLowerCase()) {
      throw new NotFoundException('Eğitim bulunamadı');
    }
    const [training] = await tx
      .select({ name: trainings.name, passScore: trainings.passScore, organizationName: organizations.name })
      .from(trainings)
      .innerJoin(trainingGroups, eq(trainingGroups.trainingId, trainings.id))
      .innerJoin(organizations, eq(organizations.id, trainingGroups.organizationId))
      .where(eq(trainingGroups.id, row.participant.groupId));
    const topics = await tx
      .select()
      .from(trainingTopics)
      .where(eq(trainingTopics.trainingId, row.trainingId))
      .orderBy(asc(trainingTopics.sortOrder));
    const questions = await tx
      .select()
      .from(trainingQuestions)
      .where(eq(trainingQuestions.trainingId, row.trainingId))
      .orderBy(asc(trainingQuestions.sortOrder));
    const attempts = await tx
      .select()
      .from(trainingExamAttempts)
      .where(eq(trainingExamAttempts.participantId, participantId))
      .orderBy(asc(trainingExamAttempts.completedAt));

    let p = row.participant;
    const now = new Date();
    if (!p.startedAt) {
      [p] = await tx.update(trainingParticipants).set({ startedAt: now }).where(eq(trainingParticipants.id, p.id)).returning();
    }
    const hasPre = questions.some((q) => q.testType === 'pre');
    const preDone = attempts.some((a) => a.testType === 'pre');
    let step: Step;
    if (p.completedAt) {
      step = 'completed';
    } else if (hasPre && !preDone) {
      step = 'pretest';
    } else {
      if (p.progressSessionId !== token.sid) {
        [p] = await tx
          .update(trainingParticipants)
          .set(this.restart(token.sid, now))
          .where(eq(trainingParticipants.id, p.id))
          .returning();
      }
      step = p.topicsCompletedAt || p.currentTopicIndex >= topics.length ? 'posttest' : 'topic';
    }
    return { participant: p, step, topics, questions, attempts, ...training };
  }

  private async present(tx: Tx, ctx: Awaited<ReturnType<PortalService['load']>>) {
    const { participant: p, step, topics, questions } = ctx;
    const exam = (type: TestType) =>
      questions
        .filter((q) => q.testType === type)
        .map((q) => ({ id: q.id, text: q.text, options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } }));
    const [lastPost] = await tx
      .select({ score: trainingExamAttempts.score, passed: trainingExamAttempts.passed })
      .from(trainingExamAttempts)
      .where(and(eq(trainingExamAttempts.participantId, p.id), eq(trainingExamAttempts.testType, 'post')))
      .orderBy(desc(trainingExamAttempts.completedAt))
      .limit(1);
    const topic = step === 'topic' ? topics[p.currentTopicIndex] : undefined;
    return {
      participantId: p.id,
      trainingName: ctx.name,
      organizationName: ctx.organizationName,
      passScore: ctx.passScore,
      step,
      topicCount: topics.length,
      topic: topic && {
        index: p.currentTopicIndex,
        title: topic.title,
        content: topic.content,
        minReadSeconds: topic.minReadSeconds,
        remainingSeconds: this.remainingSeconds(p, topic.minReadSeconds),
      },
      questions: step === 'pretest' ? exam('pre') : step === 'posttest' ? exam('post') : undefined,
      lastPostTest: lastPost ? { score: lastPost.score, passed: Boolean(lastPost.passed) } : null,
      completedAt: p.completedAt,
    };
  }
}
