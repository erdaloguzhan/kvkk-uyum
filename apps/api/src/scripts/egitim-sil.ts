/**
 * Deneme amaçlı açılmış bir eğitimi; gruplarını, katılımcı kayıtlarını, sınav sonuçlarını, alt konularını,
 * sorularını ve yalnızca bu eğitimde kullanılan görselleri tamamen siler. Panelden silinemeyen (gruba atanmış ve
 * gönderilmiş) eğitimler içindir. GERİ ALINAMAZ; gerçek çalışanlara verilmiş eğitimde kullanmayın.
 *
 * Sunucuda:
 *   docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-sil.js --ad "KVKK Farkındalık Eğitimi (eski)"
 *     -> hiçbir şey silmez; silinecekleri ve onay için gereken sayıyı gösterir.
 *   docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-sil.js --ad "…" --onay <katılımcı sayısı>
 *     -> --onay'daki sayı katılımcı sayısıyla aynıysa siler.
 *
 * Tüm işlem tek bir veritabanı işlemi (transaction) içinde yapılır.
 */
import { and, count, eq, inArray, like, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';

const { auditLogs, trainingExamAttempts, trainingGroups, trainingMedia, trainingParticipants, trainingTopics, trainings } = schema;

const MEDIA_RE = /\/api\/v1\/training-media\/([0-9a-f-]{36})/g;

class Refused extends Error {}

export interface DeleteOptions {
  name: string;
  /** Katılımcı sayısı; verilmezse ya da tutmazsa hiçbir şey silinmez. */
  confirm?: number;
  log?: (line: string) => void;
}

export async function deleteTraining(databaseUrl: string, opts: DeleteOptions): Promise<{ deleted: boolean }> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  try {
    return await db.transaction(async (tx) => {
      const found = await tx.select({ id: trainings.id, status: trainings.status }).from(trainings).where(eq(trainings.name, opts.name));
      if (!found.length) throw new Refused(`"${opts.name}" adında eğitim bulunamadı (ad birebir aynı yazılmalı).`);
      if (found.length > 1) throw new Refused(`"${opts.name}" adında ${found.length} eğitim var; hangisinin silineceği belli değil.`);
      const trainingId = found[0].id;

      const groups = await tx.select({ id: trainingGroups.id, name: trainingGroups.name }).from(trainingGroups).where(eq(trainingGroups.trainingId, trainingId));
      const groupIds = groups.map((g) => g.id);
      const [{ participants }] = groupIds.length
        ? await tx.select({ participants: count() }).from(trainingParticipants).where(inArray(trainingParticipants.groupId, groupIds))
        : [{ participants: 0 }];
      const [{ attempts }] = groupIds.length
        ? await tx
            .select({ attempts: count() })
            .from(trainingExamAttempts)
            .innerJoin(trainingParticipants, eq(trainingParticipants.id, trainingExamAttempts.participantId))
            .where(inArray(trainingParticipants.groupId, groupIds))
        : [{ attempts: 0 }];
      const topics = await tx.select({ content: trainingTopics.content }).from(trainingTopics).where(eq(trainingTopics.trainingId, trainingId));

      // Yalnızca bu eğitimin konularında geçen ve başka hiçbir konuda kullanılmayan görseller silinir.
      const mediaIds = [...new Set(topics.flatMap((t) => [...t.content.matchAll(MEDIA_RE)].map((m) => m[1])))];
      const orphanMedia: string[] = [];
      for (const id of mediaIds) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(trainingTopics)
          .where(and(ne(trainingTopics.trainingId, trainingId), like(trainingTopics.content, `%${id}%`)));
        if (n === 0) orphanMedia.push(id);
      }

      log(`Eğitim: "${opts.name}" (${found[0].status === 'active' ? 'yayında' : 'taslak'})`);
      log(`  Grup: ${groups.length}${groups.length ? ` (${groups.map((g) => g.name).join(', ')})` : ''}`);
      log(`  Katılımcı kaydı: ${participants}, tamamlanmış sınav: ${attempts}`);
      log(`  Alt konu: ${topics.length}, yalnızca bu eğitimde kullanılan görsel: ${orphanMedia.length}`);

      if (opts.confirm !== participants) {
        throw new Refused(
          `Hiçbir şey silinmedi. Silmek için komutu --onay ${participants} ekleyerek çalıştırın. Bu işlem geri alınamaz.`,
        );
      }

      if (groupIds.length) await tx.delete(trainingGroups).where(inArray(trainingGroups.id, groupIds));
      await tx.delete(trainings).where(eq(trainings.id, trainingId));
      if (orphanMedia.length) await tx.delete(trainingMedia).where(inArray(trainingMedia.id, orphanMedia));
      await tx.insert(auditLogs).values({
        action: 'training.purged',
        entityType: 'training',
        entityId: trainingId,
        metadata: { name: opts.name, groups: groups.length, participants, attempts, topics: topics.length, media: orphanMedia.length },
      });
      return { deleted: true };
    });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil');
  const name = arg('--ad');
  if (!name) {
    console.error('Eğitim adını verin: --ad "Eğitimin tam adı"');
    process.exit(1);
  }
  const onay = arg('--onay');
  deleteTraining(url, { name, confirm: onay === undefined ? undefined : Number(onay) })
    .then(() => console.log('Silindi.'))
    .catch((err) => {
      console.error(err instanceof Refused ? `SİLİNMEDİ: ${err.message}` : err);
      process.exitCode = 1;
    });
}
