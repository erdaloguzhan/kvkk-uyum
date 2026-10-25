'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import { TRAINING_STATUS } from '@/lib/training-labels';
import type { TrainingSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitimler: eğitim konu ve içerikleri ile sınav sorularının hazırlandığı yer. */
export default function TrainingsPage() {
  const router = useRouter();
  const list = useApi<{ items: TrainingSummary[] }>('training-admin/trainings');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (list.loading && !list.data) return <Loading />;
  const items = list.data?.items ?? [];

  async function remove(t: TrainingSummary) {
    if (!confirm(`"${t.name}" eğitimi silinsin mi? Alt konular ve sorular da silinir.`)) return;
    setRemoveError(null);
    try {
      await api(`training-admin/trainings/${t.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (err) {
      setRemoveError(errorText(err));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api<{ id: string }>('training-admin/trainings', { method: 'POST', body: { name } });
      router.push(`/admin/egitim/${t.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Eğitimler"
        description="Eğitimin alt konularını (ders anlatımları), ön test ve son test sorularını hazırlayın. İçerik tamamlanıp yayına alınan eğitim gruplara atanabilir."
        actions={
          <>
            <ExportButton
              fileName="Eğitimler"
              rows={items}
              columns={[
                { label: 'Eğitim adı', value: (t) => t.name },
                { label: 'Eğitimci', value: (t) => t.trainerName },
                { label: 'Alt konu sayısı', value: (t) => t.topicCount },
                { label: 'Grup sayısı', value: (t) => t.groupCount },
                { label: 'Geçme notu', value: (t) => t.passScore },
                { label: 'Durum', value: (t) => TRAINING_STATUS[t.status].label },
              ]}
            />
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Yeni eğitim
            </button>
          </>
        }
      />
      <ErrorAlert error={list.error ?? removeError} />
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <Empty title="Henüz eğitim yok">Yukarıdaki düğmeyle ilk eğitimi oluşturun.</Empty>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Eğitim</th>
                  <th>Eğitimci</th>
                  <th>Alt konu</th>
                  <th>Grup</th>
                  <th>Durum</th>
                  <th>Güncellendi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/admin/egitim/${t.id}`}>{t.name}</Link>
                    </td>
                    <td>{t.trainerName ?? '—'}</td>
                    <td>{t.topicCount}</td>
                    <td>{t.groupCount}</td>
                    <td>
                      <Badge kind={TRAINING_STATUS[t.status].kind}>{TRAINING_STATUS[t.status].label}</Badge>
                    </td>
                    <td className="nowrap">{formatDate(t.updatedAt)}</td>
                    <td className="nowrap">
                      <Link href={`/admin/egitim/${t.id}`} className="btn btn-small">
                        Düzenle
                      </Link>{' '}
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => remove(t)}
                        disabled={t.groupCount > 0}
                        title={t.groupCount > 0 ? 'Gruplara atanmış eğitim silinemez' : undefined}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="Yeni eğitim">
        <form className="form" onSubmit={create}>
          <ErrorAlert error={error} />
          <Field label="Eğitim adı" required htmlFor="t-name" hint='Örnek: "KVKK Farkındalık Eğitimi – X firması"'>
            <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Vazgeç
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Oluşturuluyor…' : 'Oluştur'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
