'use client';

import { DESTRUCTION_OPERATIONS, DestructionOperation, PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useState } from 'react';
import { DestructionTabs, MediumSelect, mediumLabel, OfficerSelect, OperationSelect, operationLabel } from '@/components/destruction';
import { ExportButton } from '@/components/export-button';
import { Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDay, todayIso } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DestructionRecord, InventoryEntry } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Gerçekleşen imha işlemi kayıtları (plandan gelenler ve plan dışı imhalar). */
export default function DestructionRecordsPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.DESTRUCTION_MANAGE);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operationType, setOperationType] = useState<DestructionOperation | ''>('');
  const [q, setQ] = useState('');
  const records = useApi<{ items: DestructionRecord[] }>('destruction/records', { from, to, operationType, q: q.trim() });
  const [dialog, setDialog] = useState<{ record?: DestructionRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = records.data?.items ?? [];

  async function remove(r: DestructionRecord) {
    const text = r.itemId
      ? 'İmha kaydı silinsin mi? Plandaki iş yeniden "Planlandı" durumuna döner.'
      : 'İmha kaydı silinsin mi?';
    if (!confirm(text)) return;
    try {
      await api(`destruction/records/${r.id}`, { method: 'DELETE' });
      records.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Kişisel veri imha yönetimi"
        description="Gerçekleşen her imha burada kayıt altındadır. Kayıtlar yönetmelik gereği en az 3 yıl saklanmalıdır."
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setDialog({})}>
              + Plan dışı imha kaydı
            </button>
          )
        }
      />
      <DestructionTabs />
      <div className="toolbar">
        <input type="search" placeholder="Veri, işlem veya sorumlu ara" aria-label="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="small">
          Başlangıç <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="small">
          Bitiş <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select aria-label="İşlem türü" value={operationType} onChange={(e) => setOperationType(e.target.value as DestructionOperation | '')}>
          <option value="">Tüm işlem türleri</option>
          {(Object.keys(DESTRUCTION_OPERATIONS) as DestructionOperation[]).map((o) => (
            <option key={o} value={o}>
              {DESTRUCTION_OPERATIONS[o]}
            </option>
          ))}
        </select>
        <ExportButton
          fileName="imha-islemi-kayitlari"
          rows={items}
          columns={[
            { label: 'Gerçekleşme tarihi', value: (r) => formatDay(r.performedDate) },
            { label: 'İmha edilen veri', value: (r) => r.dataDescription },
            { label: 'Kayıt ortamı', value: (r) => mediumLabel(r.storageMedium) },
            { label: 'İşlem türü', value: (r) => operationLabel(r.operationType) },
            { label: 'Yapılan işlem', value: (r) => r.performedNote },
            { label: 'İmha sorumlusu', value: (r) => r.officerName },
            { label: 'İmha planı', value: (r) => r.planTitle ?? 'Plan dışı' },
            { label: 'Planlanan tarih', value: (r) => (r.plannedDate ? formatDay(r.plannedDate) : '') },
          ]}
        />
      </div>
      <ErrorAlert error={records.error ?? error} />
      {records.loading && !records.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="İmha kaydı yok">
            Plandaki bir imha &quot;Gerçekleşti&quot; olarak işaretlendiğinde kaydı burada otomatik açılır.
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gerçekleşme</th>
                <th>İmha edilen veri</th>
                <th>Kayıt ortamı</th>
                <th>İşlem türü</th>
                <th>Yapılan işlem</th>
                <th>İmha sorumlusu</th>
                <th>Plan</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDay(r.performedDate)}</td>
                  <td>{r.dataDescription}</td>
                  <td className="nowrap">{mediumLabel(r.storageMedium)}</td>
                  <td className="nowrap">{operationLabel(r.operationType)}</td>
                  <td className="small description">{r.performedNote}</td>
                  <td>{r.officerName ?? '—'}</td>
                  <td className="small">
                    {r.planId ? <Link href={`/imha/${r.planId}`}>{r.planTitle}</Link> : (r.planTitle ?? <span className="muted">Plan dışı</span>)}
                    {r.plannedDate && <div className="muted">Planlanan: {formatDay(r.plannedDate)}</div>}
                  </td>
                  {canManage && (
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => setDialog({ record: r })}>
                        Düzenle
                      </button>{' '}
                      <button className="btn btn-small btn-danger" onClick={() => remove(r)}>
                        Sil
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <RecordDialog
          record={dialog.record}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            records.reload();
          }}
        />
      )}
    </>
  );
}

const entryText = (e: InventoryEntry) => `${e.department} / ${e.activity} / ${e.dataCategory}`;

function RecordDialog({ record, onClose, onSaved }: { record?: DestructionRecord; onClose: () => void; onSaved: () => void }) {
  const inventory = useApi<{ items: InventoryEntry[] }>(record ? null : 'inventory');
  const [entryId, setEntryId] = useState('');
  const [description, setDescription] = useState(record?.dataDescription ?? '');
  const [medium, setMedium] = useState<string>(record?.storageMedium ?? '');
  const [performedDate, setPerformedDate] = useState(record?.performedDate ?? todayIso());
  const [operation, setOperation] = useState<DestructionOperation>(record?.operationType ?? 'deletion');
  const [note, setNote] = useState(record?.performedNote ?? '');
  const [officerId, setOfficerId] = useState(record?.officerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickEntry(id: string) {
    setEntryId(id);
    const e = inventory.data?.items.find((x) => x.id === id);
    if (!e) return;
    setDescription(entryText(e));
    setMedium(e.storageMedium ?? '');
    setOperation(e.storageMedium === 'physical' ? 'destruction' : 'deletion');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      dataDescription: description.trim(),
      storageMedium: medium || null,
      performedDate,
      operationType: operation,
      performedNote: note.trim(),
      officerId: officerId || null,
    };
    try {
      if (record) await api(`destruction/records/${record.id}`, { method: 'PATCH', body });
      else await api('destruction/records', { method: 'POST', body: { ...body, inventoryEntryId: entryId || null } });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={record ? 'İmha kaydını düzenle' : 'Plan dışı imha kaydı'}>
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        {!record && (
          <Field label="Veri envanteri satırı" htmlFor="r-entry">
            <select id="r-entry" value={entryId} onChange={(e) => pickEntry(e.target.value)}>
              <option value="">{inventory.loading ? 'Yükleniyor…' : 'Envanterden seçilmedi'}</option>
              {(inventory.data?.items ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {entryText(e)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="İmha edilen veri" htmlFor="r-desc" required hint="Ör. ilgili kişinin silme talebi üzerine CRM kaydı.">
          <textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={1000} />
        </Field>
        <div className="form-row">
          <Field label="Gerçekleşme tarihi" htmlFor="r-date" required>
            <input id="r-date" type="date" value={performedDate} max={todayIso()} onChange={(e) => setPerformedDate(e.target.value)} required />
          </Field>
          <Field label="İşlem türü" htmlFor="r-op" required>
            <OperationSelect id="r-op" value={operation} onChange={setOperation} />
          </Field>
        </div>
        <Field label="Kayıt ortamı" htmlFor="r-medium">
          <MediumSelect id="r-medium" value={medium} onChange={setMedium} />
        </Field>
        <Field label="Yapılan işlem" htmlFor="r-note" required hint="Kullanılan yöntem, araç, tutanak numarası gibi bilgiler.">
          <textarea id="r-note" value={note} onChange={(e) => setNote(e.target.value)} required minLength={2} maxLength={5000} />
        </Field>
        <Field label="İmha sorumlusu" htmlFor="r-officer">
          <OfficerSelect id="r-officer" value={officerId} onChange={setOfficerId} emptyLabel={record ? 'Atanmamış' : 'Tarihteki dönemin sorumlusu'} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
