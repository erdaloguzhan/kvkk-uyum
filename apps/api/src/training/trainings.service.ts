import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import {
  trainingExamAnswers,
  trainingGroups,
  trainingMedia,
  trainingQuestions,
  trainings,
  trainingTopics,
} from '../db/schema';
import {
  questionBody,
  questionUpdateBody,
  topicBody,
  topicUpdateBody,
  trainingCreateBody,
  trainingUpdateBody,
} from './training.schema';

export const REQUIRED_TOTAL_POINTS = 100;
export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export type TestType = 'pre' | 'post';
export const TEST_LABELS: Record<TestType, string> = { pre: 'Ön test', post: 'Son test' };

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr');

/** Eğitimler, alt konuları, sınav soruları ve ders görselleri. */
@Injectable()
export class TrainingsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        training: trainings,
        // Sütunlar tablo adıyla yazılır; tek tablolu sorguda Drizzle adları niteliksiz üretir ve "id" alt sorgunun tablosuna bağlanır.
        topicCount: sql<number>`(select count(*)::int from "training_topics" tt where tt."training_id" = "trainings"."id")`,
        groupCount: sql<number>`(select count(*)::int from "training_groups" tg where tg."training_id" = "trainings"."id")`,
      })
      .from(trainings);
    return rows
      .map((r) => ({
        ...r.training,
        topicCount: r.topicCount,
        groupCount: r.groupCount,
      }))
      .sort((a, b) => byTurkish(a.name, b.name));
  }

  /** Eğitim, alt konuları ve soruları (doğru cevaplarla; yalnızca yönetim paneli). */
  async get(id: string) {
    const training = (await this.list()).find((t) => t.id === id);
    if (!training) throw new NotFoundException('Eğitim bulunamadı');
    const topics = await this.db
      .select()
      .from(trainingTopics)
      .where(eq(trainingTopics.trainingId, id))
      .orderBy(asc(trainingTopics.sortOrder));
    const questions = await this.db
      .select()
      .from(trainingQuestions)
      .where(eq(trainingQuestions.trainingId, id))
      .orderBy(asc(trainingQuestions.sortOrder));
    const total = (t: TestType) => questions.filter((q) => q.testType === t).reduce((s, q) => s + q.points, 0);
    return {
      ...training,
      topics,
      questions,
      totals: { pre: total('pre'), post: total('post') },
      questionsLocked: await this.hasAnswers(id),
      problems: this.problems(topics.length, total('pre'), total('post')),
    };
  }

  async create(userId: string, input: z.infer<typeof trainingCreateBody>) {
    const [row] = await this.db
      .insert(trainings)
      .values({ ...input, createdBy: userId })
      .returning({ id: trainings.id });
    await this.audit.record({ action: 'training.created', userId, entityType: 'training', entityId: row.id });
    return this.get(row.id);
  }

  async update(userId: string, id: string, input: z.infer<typeof trainingUpdateBody>) {
    const current = await this.get(id);
    if (input.status === 'active' && current.problems.length) {
      throw new BadRequestException(`Eğitim yayına alınamaz: ${current.problems.join('; ')}`);
    }
    if (input.status === 'draft' && current.status === 'active' && current.groupCount > 0) {
      throw new ConflictException('Gruplara atanmış eğitim taslağa alınamaz');
    }
    await this.db
      .update(trainings)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(trainings.id, id));
    await this.audit.record({
      action: 'training.updated',
      userId,
      entityType: 'training',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(id);
  }

  async remove(userId: string, id: string) {
    const current = await this.get(id);
    if (current.groupCount > 0) throw new ConflictException('Gruplara atanmış eğitim silinemez');
    await this.db.delete(trainings).where(eq(trainings.id, id));
    await this.audit.record({ action: 'training.deleted', userId, entityType: 'training', entityId: id });
  }

  // --- Alt konular ---------------------------------------------------------------------------

  async addTopic(userId: string, trainingId: string, input: z.infer<typeof topicBody>) {
    await this.ensureTraining(trainingId);
    const [{ last }] = await this.db
      .select({ last: max(trainingTopics.sortOrder) })
      .from(trainingTopics)
      .where(eq(trainingTopics.trainingId, trainingId));
    const [row] = await this.db
      .insert(trainingTopics)
      .values({ ...input, trainingId, sortOrder: (last ?? 0) + 1 })
      .returning();
    await this.touch(userId, trainingId, 'training.topic_added', row.id);
    return row;
  }

  async updateTopic(userId: string, topicId: string, input: z.infer<typeof topicUpdateBody>) {
    const topic = await this.findTopic(topicId);
    const [row] = await this.db
      .update(trainingTopics)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(trainingTopics.id, topicId))
      .returning();
    await this.touch(userId, topic.trainingId, 'training.topic_updated', topicId);
    return row;
  }

  async removeTopic(userId: string, topicId: string) {
    const topic = await this.findTopic(topicId);
    const training = await this.get(topic.trainingId);
    if (training.status === 'active' && training.topics.length <= 1) {
      throw new BadRequestException('Yayındaki eğitimin son alt konusu silinemez');
    }
    await this.db.delete(trainingTopics).where(eq(trainingTopics.id, topicId));
    await this.touch(userId, topic.trainingId, 'training.topic_deleted', topicId);
  }

  /** Alt konuları verilen sırayla dizer (eğitimin tüm alt konuları verilmeli). */
  async reorderTopics(userId: string, trainingId: string, ids: string[]) {
    const topics = await this.db
      .select({ id: trainingTopics.id })
      .from(trainingTopics)
      .where(eq(trainingTopics.trainingId, trainingId));
    const known = new Set(topics.map((t) => t.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((i) => known.has(i))) {
      throw new BadRequestException('Eğitimin tüm alt konuları birer kez verilmeli');
    }
    await this.db.transaction(async (tx) => {
      for (const [i, topicId] of ids.entries()) {
        await tx.update(trainingTopics).set({ sortOrder: i + 1 }).where(eq(trainingTopics.id, topicId));
      }
    });
    await this.touch(userId, trainingId, 'training.topics_reordered');
    return (await this.get(trainingId)).topics;
  }

  // --- Sınav soruları --------------------------------------------------------------------------

  async addQuestion(userId: string, trainingId: string, input: z.infer<typeof questionBody>) {
    await this.ensureTraining(trainingId);
    await this.ensureQuestionsEditable(trainingId);
    const siblings = await this.db
      .select({ points: trainingQuestions.points, sortOrder: trainingQuestions.sortOrder })
      .from(trainingQuestions)
      .where(and(eq(trainingQuestions.trainingId, trainingId), eq(trainingQuestions.testType, input.testType)));
    this.checkTotal(input.testType, siblings.reduce((s, q) => s + q.points, 0) + input.points);
    const [row] = await this.db
      .insert(trainingQuestions)
      .values({ ...input, trainingId, sortOrder: Math.max(0, ...siblings.map((q) => q.sortOrder)) + 1 })
      .returning();
    await this.touch(userId, trainingId, 'training.question_added', row.id);
    return row;
  }

  async updateQuestion(userId: string, questionId: string, input: z.infer<typeof questionUpdateBody>) {
    const q = await this.findQuestion(questionId);
    await this.ensureQuestionsEditable(q.trainingId);
    if (input.points !== undefined) {
      const siblings = await this.db
        .select({ id: trainingQuestions.id, points: trainingQuestions.points })
        .from(trainingQuestions)
        .where(and(eq(trainingQuestions.trainingId, q.trainingId), eq(trainingQuestions.testType, q.testType)));
      this.checkTotal(q.testType, siblings.reduce((s, x) => s + (x.id === q.id ? input.points! : x.points), 0));
    }
    const [row] = await this.db
      .update(trainingQuestions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(trainingQuestions.id, questionId))
      .returning();
    await this.touch(userId, q.trainingId, 'training.question_updated', questionId);
    return row;
  }

  async removeQuestion(userId: string, questionId: string) {
    const q = await this.findQuestion(questionId);
    await this.ensureQuestionsEditable(q.trainingId);
    const [t] = await this.db.select({ status: trainings.status }).from(trainings).where(eq(trainings.id, q.trainingId));
    if (t.status === 'active') {
      throw new BadRequestException('Yayındaki eğitimden soru silinemez (toplam puan 100 altına düşer); önce eğitimi taslağa alın');
    }
    await this.db.delete(trainingQuestions).where(eq(trainingQuestions.id, questionId));
    await this.touch(userId, q.trainingId, 'training.question_deleted', questionId);
  }

  // --- Görseller -------------------------------------------------------------------------------

  async addMedia(userId: string, file: { buffer: Buffer; mimetype: string; originalname: string }) {
    if (!MEDIA_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Yalnızca PNG, JPEG, GIF veya WebP görsel yüklenebilir');
    }
    const [row] = await this.db
      .insert(trainingMedia)
      .values({
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        mimeType: file.mimetype,
        content: file.buffer,
        sizeBytes: file.buffer.length,
        createdBy: userId,
      })
      .returning({ id: trainingMedia.id });
    return { id: row.id, url: `/api/v1/training-media/${row.id}` };
  }

  async media(id: string) {
    const [row] = await this.db
      .select({ mimeType: trainingMedia.mimeType, content: trainingMedia.content })
      .from(trainingMedia)
      .where(eq(trainingMedia.id, id));
    if (!row) throw new NotFoundException('Görsel bulunamadı');
    return row;
  }

  // --- Yardımcılar ------------------------------------------------------------------------------

  /** Eğitimin yayına alınmasına engel eksikler. */
  problems(topicCount: number, pre: number, post: number) {
    const list: string[] = [];
    if (topicCount === 0) list.push('en az bir alt konu ekleyin');
    if (pre !== REQUIRED_TOTAL_POINTS) list.push(`ön test soru puanları toplamı ${pre}, 100 olmalı`);
    if (post !== REQUIRED_TOTAL_POINTS) list.push(`son test soru puanları toplamı ${post}, 100 olmalı`);
    return list;
  }

  private checkTotal(testType: TestType, total: number) {
    if (total > REQUIRED_TOTAL_POINTS) {
      throw new BadRequestException(`${TEST_LABELS[testType]} soru puanları toplamı 100'ü geçemez (bu işlemle ${total} olur)`);
    }
  }

  /** Bir katılımcı soruları cevapladıysa sorular değiştirilemez (sonuçlar sorulara bağlıdır). */
  private async hasAnswers(trainingId: string) {
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(trainingExamAnswers)
      .innerJoin(trainingQuestions, eq(trainingQuestions.id, trainingExamAnswers.questionId))
      .where(eq(trainingQuestions.trainingId, trainingId));
    return n > 0;
  }

  private async ensureQuestionsEditable(trainingId: string) {
    if (await this.hasAnswers(trainingId)) {
      throw new ConflictException('Katılımcılar bu eğitimin sınavını çözdüğü için sorular değiştirilemez');
    }
  }

  private async touch(userId: string, trainingId: string, action: string, entityId?: string) {
    await this.db.update(trainings).set({ updatedAt: new Date() }).where(eq(trainings.id, trainingId));
    await this.audit.record({ action, userId, entityType: 'training', entityId: entityId ?? trainingId, metadata: { trainingId } });
  }

  private async ensureTraining(id: string) {
    const [row] = await this.db.select({ id: trainings.id }).from(trainings).where(eq(trainings.id, id));
    if (!row) throw new NotFoundException('Eğitim bulunamadı');
  }

  private async findTopic(id: string) {
    const [row] = await this.db.select().from(trainingTopics).where(eq(trainingTopics.id, id));
    if (!row) throw new NotFoundException('Alt konu bulunamadı');
    return row;
  }

  private async findQuestion(id: string) {
    const [row] = await this.db.select().from(trainingQuestions).where(eq(trainingQuestions.id, id));
    if (!row) throw new NotFoundException('Soru bulunamadı');
    return row;
  }
}
