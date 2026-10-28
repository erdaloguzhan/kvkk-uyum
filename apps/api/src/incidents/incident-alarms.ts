import { INCIDENT_DEADLINE_WARNING_HOURS, INCIDENT_NOTIFY_DEADLINE_HOURS, INCIDENT_OPEN_STATUSES, PERMISSIONS } from '@kvkk/shared';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { Database } from '../db/db.module';
import { incidents } from '../db/schema';
import { activeMembersWithAny } from '../workflow/members';
import type { NewNotification } from '../workflow/notifications.service';
import { formatDateTime } from './frm020-docx';

const HOUR_MS = 60 * 60 * 1000;
/** Süresi geçen bildirim bu kadar gün boyunca her gün hatırlatılır. */
const OVERDUE_REMINDER_DAYS = 30;

/**
 * Kurula bildirilmemiş ilk bildirimler için 72 saat alarmları (PRS-030): son 24 saate girince bir kez,
 * süre geçince her gün bir kez. Sorumlu ve Yöneticilere gider; tekil anahtarlar tekrar üretimi engeller.
 */
export async function incidentDeadlineAlarms(db: Database, now: Date): Promise<NewNotification[]> {
  const oldest = new Date(now.getTime() - (INCIDENT_NOTIFY_DEADLINE_HOURS + OVERDUE_REMINDER_DAYS * 24) * HOUR_MS);
  const rows = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.notificationType, 'initial'),
        inArray(incidents.status, INCIDENT_OPEN_STATUSES),
        gte(incidents.detectedAt, oldest),
      ),
    );
  const out: NewNotification[] = [];
  const recipients = new Map<string, { id: string }[]>();
  for (const i of rows) {
    const deadline = new Date(i.detectedAt.getTime() + INCIDENT_NOTIFY_DEADLINE_HOURS * HOUR_MS);
    const hoursLeft = (deadline.getTime() - now.getTime()) / HOUR_MS;
    if (hoursLeft > INCIDENT_DEADLINE_WARNING_HOURS) continue;
    let members = recipients.get(i.organizationId);
    if (!members) {
      members = await activeMembersWithAny(db, i.organizationId, [PERMISSIONS.INCIDENTS_MANAGE, PERMISSIONS.INCIDENTS_APPROVE]);
      recipients.set(i.organizationId, members);
    }
    const name = `İhlal #${i.number} ${i.title}`;
    const due = formatDateTime(deadline);
    const alarm =
      hoursLeft > 0
        ? {
            title: `Kurula bildirim için ${Math.ceil(hoursLeft)} saat kaldı: İhlal #${i.number}`,
            body: `${name} henüz Kurula bildirilmedi.\nSon süre: ${due} (tespitten itibaren ${INCIDENT_NOTIFY_DEADLINE_HOURS} saat)\n`,
            key: 'warning',
          }
        : {
            title: `Kurula bildirim süresi geçti: İhlal #${i.number}`,
            body:
              `${name} için ${INCIDENT_NOTIFY_DEADLINE_HOURS} saatlik bildirim süresi doldu ve kayıt henüz kapatılmadı.\n` +
              `Son süre: ${due}\nBildirimi bir an önce yapın ve formdaki gecikme sebebini doldurun.\n`,
            key: `overdue:${Math.floor(-hoursLeft / 24)}`,
          };
    for (const m of members) {
      out.push({
        organizationId: i.organizationId,
        userId: m.id,
        kind: 'incident_deadline',
        title: alarm.title,
        body: alarm.body,
        incidentId: i.id,
        dedupeKey: `incident:${i.id}:${alarm.key}:${m.id}`,
      });
    }
  }
  return out;
}
