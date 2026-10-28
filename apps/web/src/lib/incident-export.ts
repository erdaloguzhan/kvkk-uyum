import { INCIDENT_NOTIFICATION_TYPES, INCIDENT_STATUSES } from '@kvkk/shared';
import type { ExportColumn } from './export';
import { formatDateTime } from './labels';
import type { Incident } from './types';

/** Veri ihlali listesinin ve raporunun Excel sütunları. */
export const INCIDENT_EXPORT_COLUMNS: ExportColumn<Incident>[] = [
  { label: 'No', value: (i) => i.number },
  { label: 'Olay başlığı', value: (i) => i.title },
  { label: 'Bildirim türü', value: (i) => INCIDENT_NOTIFICATION_TYPES[i.notificationType] },
  { label: 'Gerçekleşme', value: (i) => (i.occurredAt ? formatDateTime(i.occurredAt) : null) },
  { label: 'Tespit', value: (i) => formatDateTime(i.detectedAt) },
  { label: 'Bildirim son süresi', value: (i) => (i.deadlineAt ? formatDateTime(i.deadlineAt) : null) },
  { label: 'Durum', value: (i) => INCIDENT_STATUSES[i.status] },
  { label: 'Kurula bildirim', value: (i) => (i.notifiedAt ? formatDateTime(i.notifiedAt) : null) },
  { label: '72 saat içinde', value: (i) => (i.notifiedOnTime === null ? null : i.notifiedOnTime ? 'Evet' : 'Hayır') },
  { label: 'Kaynak', value: (i) => [...i.form.sources, ...(i.form.sourceOther ? [i.form.sourceOther] : [])].join(', ') },
  { label: 'Kişisel veri kategorileri', value: (i) => i.form.personalCategories.join(', ') },
  { label: 'Özel nitelikli veri kategorileri', value: (i) => i.form.specialCategories.join(', ') },
  { label: 'Tahmini kişi sayısı', value: (i) => i.form.estimatedPeople },
  { label: 'Tahmini kayıt sayısı', value: (i) => i.form.estimatedRecords },
  { label: 'Siber saldırı', value: (i) => (i.form.cyberAttack === null ? null : i.form.cyberAttack ? 'Evet' : 'Hayır') },
  { label: 'Kapanış notu', value: (i) => i.closingNote },
];
