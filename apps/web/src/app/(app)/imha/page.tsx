'use client';

import { DESTRUCTION_PERIOD_OPTIONS, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DestructionTabs, planStatusBadge } from '@/components/destruction';
import { Alert, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDay } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DestructionPlan, DestructionPlanSummary, DestructionSettings } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** İmha planları, periyodik imha süresi ve dönem uyarısı. */
export default function DestructionPlansPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.DESTRUCTION_MANAGE);
  const plans = useApi<{ items: DestructionPlanSummary[] }>('destruction/plans');
  const settings = useApi<DestructionSettings>('destruction/settings');
  const [creating, setCreating] = useState(false);
  const items = plans.data?.items ?? [];
  const s = settings.data;

  return (
    <>
      <PageHeader
        title="Kişisel veri imha yönetimi"
        description="Saklama ve İmha Politikasına göre periyodik imha planları, imha sorumluları ve gerçekleşen imha kayıtları."
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Yeni imha planı
            </button>
          )
        }
      />
      <DestructionTabs />
      <ErrorAlert error={plans.error ?? settings.error} />
      {s && <PeriodCard settings={s} canManage={canManage} onSaved={settings.reload} />}
      {s?.uncovered && (
        <Alert kind="warning">
          {s.lastPlanEnd
            ? `Son imha planının dönemi ${formatDay(s.lastPlanEnd)} tarihinde bitti. Bu dönem için yeni bir imha planı hazırlayın.`
            : 'Henüz imha planı yok. Veri envanterinden ilk imha planını hazırlayın.'}
        </Alert>
      )}
      {plans.loading && !plans.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Henüz imha planı yok">
            {canManage && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                + Yeni imha planı
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Dönem</th>
                <th>Durum</th>
                <th>İmha işi</th>
                <th>Gerçekleşen</th>
                <th>İptal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/imha/${p.id}`}>{p.title}</Link>
                  </td>
                  <td className="nowrap">
                    {formatDay(p.periodStart)} – {formatDay(p.periodEnd)}
                  </td>
                  <td>{planStatusBadge(p.status)}</td>
                  <td>{p.itemCount}</td>
                  <td>{p.doneCount}</td>
                  <td>{p.cancelledCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && s && <NewPlanDialog settings={s} onClose={() => setCreating(false)} />}
    </>
  );
}

function PeriodCard({ settings, canManage, onSaved }: { settings: DestructionSettings; canManage: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [months, setMonths] = useState(String(settings.periodMonths));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('destruction/settings', { method: 'PUT', body: { periodMonths: Number(months) } });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <ErrorAlert error={error} />
      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <div>
          <strong>Periyodik imha süresi:</strong>{' '}
          {editing ? (
            <select aria-label="Periyodik imha süresi" value={months} onChange={(e) => setMonths(e.target.value)}>
              {DESTRUCTION_PERIOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} ayda bir
                </option>
              ))}
            </select>
          ) : (
            <>{settings.periodMonths} ayda bir</>
          )}
          <div className="small muted">
            Saklama ve İmha Politikasında belirlenen süre. Yeni dönem planları bu süreye göre açılır; yönetmelik en fazla 6 ay öngörür.
          </div>
        </div>
        {canManage &&
          (editing ? (
            <>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                Kaydet
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Vazgeç
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setEditing(true)}>
              Değiştir
            </button>
          ))}
      </div>
    </div>
  );
}

const addMonthsIso = (day: string, months: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d) - 86_400_000);
  return end.toISOString().slice(0, 10);
};

function NewPlanDialog({ settings, onClose }: { settings: DestructionSettings; onClose: () => void }) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(settings.nextPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(addMonthsIso(settings.nextPeriodStart, settings.periodMonths));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fromInventory, setFromInventory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStart(v: string) {
    setPeriodStart(v);
    if (v) setPeriodEnd(addMonthsIso(v, settings.periodMonths));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const plan = await api<DestructionPlan>('destruction/plans', {
        method: 'POST',
        body: {
          title: title.trim() || `${formatDay(periodStart)} – ${formatDay(periodEnd)} imha planı`,
          periodStart,
          periodEnd,
          description: description.trim() || null,
          fromInventory,
        },
      });
      router.push(`/imha/${plan.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Yeni imha planı">
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        <Field label="Plan adı" htmlFor="p-title" hint="Boş bırakılırsa dönem tarihleriyle adlandırılır.">
          <input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ör. 2026 / 2. dönem" />
        </Field>
        <div className="form-row">
          <Field label="Dönem başlangıcı" htmlFor="p-start" required>
            <input id="p-start" type="date" value={periodStart} onChange={(e) => changeStart(e.target.value)} required />
          </Field>
          <Field label="Dönem bitişi" htmlFor="p-end" required hint={`Periyodik imha süresi: ${settings.periodMonths} ay`}>
            <input id="p-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </Field>
        </div>
        <Field label="Açıklama" htmlFor="p-desc">
          <textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={fromInventory} onChange={(e) => setFromInventory(e.target.checked)} />
          Veri envanterindeki tüm satırları plana ekle (saklama süresi dolmayanları sonra plandan çıkarabilirsiniz)
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Oluşturuluyor…' : 'Planı oluştur'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
