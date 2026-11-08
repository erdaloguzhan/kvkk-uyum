/**
 * "KVKK Farkındalık Eğitimi"nin alt konularını (görselleriyle) ve ön test / son test sorularını yükler.
 *
 * Sunucuda:
 *   docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-icerik-yukle.js --deneme
 *   docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-icerik-yukle.js
 *
 * Seçenekler:
 *   --deneme     Hiçbir şey yazmadan ne yapılacağını gösterir.
 *   --degistir   Eğitimde zaten alt konu veya soru varsa onları silip yenilerini yükler. Katılımcılardan biri
 *                eğitime başladıysa ya da sınav çözüldüyse çalışmaz.
 *   --ad "…"     Eğitim adı (varsayılan "KVKK Farkındalık Eğitimi"). Eğitim yoksa taslak olarak oluşturulur.
 *
 * Tüm işlem tek bir veritabanı işlemi (transaction) içinde yapılır: hata olursa hiçbir şey değişmez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { POST_TEST, PRE_TEST, QuestionSeed, readSeconds, TOPICS, TRAINING_NAME } from './icerik/kvkk-farkindalik';

const { auditLogs, trainingExamAttempts, trainingGroups, trainingMedia, trainingParticipants, trainingQuestions, trainingTopics, trainings } =
  schema;

const ASSET_DIR = path.join(__dirname, '../../assets/egitim/kvkk-farkindalik');

export interface LoadOptions {
  trainingName?: string;
  replace?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface LoadResult {
  trainingId: string | null;
  created: boolean;
  topics: number;
  questions: number;
}

class Refused extends Error {}

export async function loadTrainingContent(databaseUrl: string, opts: LoadOptions = {}): Promise<LoadResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const name = opts.trainingName ?? TRAINING_NAME;
  checkContent();
  const images = TOPICS.map((t) => {
    const file = path.join(ASSET_DIR, t.image);
    if (!fs.existsSync(file)) throw new Error(`Görsel bulunamadı: ${file}`);
    return fs.readFileSync(file);
  });

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  try {
    return await db.transaction(async (tx) => {
      const found = await tx.select({ id: trainings.id, status: trainings.status }).from(trainings).where(eq(trainings.name, name));
      if (found.length > 1) throw new Refused(`"${name}" adında ${found.length} eğitim var; hangisine yükleneceği belli değil.`);
      let trainingId = found[0]?.id ?? null;
      const created = !trainingId;

      if (trainingId) {
        const [{ topics }] = await tx.select({ topics: count() }).from(trainingTopics).where(eq(trainingTopics.trainingId, trainingId));
        const [{ questions }] = await tx
          .select({ questions: count() })
          .from(trainingQuestions)
          .where(eq(trainingQuestions.trainingId, trainingId));
        log(`"${name}" bulundu (durum: ${found[0].status === 'active' ? 'yayında' : 'taslak'}); mevcut ${topics} alt konu, ${questions} soru.`);
        if (topics + questions > 0) {
          if (!opts.replace) {
            throw new Refused(
              'Eğitimde zaten alt konu veya soru var. Bunları silip yenilerini yüklemek için komutu --degistir ile çalıştırın.',
            );
          }
          const groupIds = (await tx.select({ id: trainingGroups.id }).from(trainingGroups).where(eq(trainingGroups.trainingId, trainingId))).map(
            (g) => g.id,
          );
          if (groupIds.length) {
            const [{ started }] = await tx
              .select({ started: count() })
              .from(trainingParticipants)
              .where(and(inArray(trainingParticipants.groupId, groupIds), isNotNull(trainingParticipants.startedAt)));
            const [{ attempts }] = await tx
              .select({ attempts: count() })
              .from(trainingExamAttempts)
              .innerJoin(trainingParticipants, eq(trainingParticipants.id, trainingExamAttempts.participantId))
              .where(inArray(trainingParticipants.groupId, groupIds));
            if (started + attempts > 0) {
              throw new Refused(
                `Bu eğitime başlamış ${started} katılımcı var; içerik değiştirilirse ilerlemeleri ve sınav sonuçları bozulur. ` +
                  'Yükleme yapılmadı. Yeni bir eğitim adıyla yüklemek için --ad "…" kullanın.',
              );
            }
          }
          log(`Mevcut ${topics} alt konu ve ${questions} soru silinecek.`);
          if (!opts.dryRun) {
            await tx.delete(trainingTopics).where(eq(trainingTopics.trainingId, trainingId));
            await tx.delete(trainingQuestions).where(eq(trainingQuestions.trainingId, trainingId));
          }
        }
      } else {
        log(`"${name}" bulunamadı; taslak olarak oluşturulacak.`);
        if (!opts.dryRun) {
          const [row] = await tx.insert(trainings).values({ name, passScore: 70 }).returning({ id: trainings.id });
          trainingId = row.id;
        }
      }

      for (const [i, topic] of TOPICS.entries()) {
        const seconds = readSeconds(topic.content);
        log(`  ${String(i + 1).padStart(2)}. ${topic.title}  (en az ${formatDuration(seconds)})`);
        if (opts.dryRun) continue;
        const [media] = await tx
          .insert(trainingMedia)
          .values({ fileName: `kvkk-farkindalik-${topic.image}`, mimeType: 'image/png', content: images[i], sizeBytes: images[i].length })
          .returning({ id: trainingMedia.id });
        const content = topic.content.replace('{{gorsel}}', `![${topic.imageAlt}](/api/v1/training-media/${media.id})`);
        await tx.insert(trainingTopics).values({ trainingId: trainingId!, sortOrder: i, title: topic.title, content, minReadSeconds: seconds });
      }

      const questionRows = (type: 'pre' | 'post', list: QuestionSeed[]) =>
        list.map((q, i) => ({
          trainingId: trainingId!,
          testType: type,
          sortOrder: i,
          text: q.text,
          optionA: q.options[0],
          optionB: q.options[1],
          optionC: q.options[2],
          optionD: q.options[3],
          correctOption: q.correct,
          points: 100 / list.length,
        }));
      log(`Ön test: ${PRE_TEST.length} soru, son test: ${POST_TEST.length} soru (her soru ${100 / PRE_TEST.length} puan).`);
      if (!opts.dryRun) {
        await tx.insert(trainingQuestions).values([...questionRows('pre', PRE_TEST), ...questionRows('post', POST_TEST)]);
        await tx.update(trainings).set({ updatedAt: new Date() }).where(eq(trainings.id, trainingId!));
        await tx.insert(auditLogs).values({
          action: 'training.content_imported',
          entityType: 'training',
          entityId: trainingId!,
          metadata: { trainingId, topics: TOPICS.length, questions: PRE_TEST.length + POST_TEST.length, replaced: !created },
        });
      }
      return { trainingId, created, topics: TOPICS.length, questions: PRE_TEST.length + POST_TEST.length };
    });
  } finally {
    await pool.end();
  }
}

/** İçerik dosyasındaki hataları yükleme öncesinde yakalar (puan toplamı 100, şık sayısı vb.). */
function checkContent() {
  for (const [label, list] of [
    ['Ön test', PRE_TEST],
    ['Son test', POST_TEST],
  ] as const) {
    if (100 % list.length !== 0) throw new Error(`${label}: soru sayısı 100'ü tam bölmeli`);
    for (const q of list) {
      if (q.options.some((o) => !o.trim())) throw new Error(`${label}: boş şık var: ${q.text}`);
    }
  }
  for (const t of TOPICS) if (!t.content.includes('{{gorsel}}')) throw new Error(`Görsel yeri yok: ${t.title}`);
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} dk${r ? ` ${r} sn` : ''}` : `${r} sn`;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const nameIdx = args.indexOf('--ad');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil');
  const dryRun = args.includes('--deneme');
  loadTrainingContent(url, {
    dryRun,
    replace: args.includes('--degistir'),
    trainingName: nameIdx >= 0 ? args[nameIdx + 1] : undefined,
  })
    .then((r) => {
      console.log(
        dryRun
          ? 'DENEME: hiçbir şey kaydedilmedi. Yüklemek için komutu --deneme olmadan çalıştırın.'
          : `Tamamlandı: ${r.topics} alt konu ve ${r.questions} soru yüklendi. Eğitim, yönetim panelinde Eğitimler sayfasında.`,
      );
    })
    .catch((err) => {
      console.error(err instanceof Refused ? `YÜKLENMEDİ: ${err.message}` : err);
      process.exitCode = 1;
    });
}
