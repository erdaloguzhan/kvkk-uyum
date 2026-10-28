'use client';

import {
  DESTRUCTION_ITEM_STATUSES,
  DESTRUCTION_OPERATIONS,
  DESTRUCTION_PLAN_STATUSES,
  DestructionItemStatus,
  DestructionOperation,
  DestructionPlanStatus,
  STORAGE_MEDIA,
  StorageMedium,
} from '@kvkk/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDay, todayIso } from '@/lib/labels';
import type { DestructionItem, DestructionOfficer, InventoryEntry } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Badge, ErrorAlert, Field, Modal } from './ui';

/** İmha yönetiminin üç bölümü arasında geçiş. */
export function DestructionTabs() {
  const pathname = usePathname();
  const tabs: [string, string][] = [
    ['/imha', 'İmha planları'],
    ['/imha/sorumlular', 'İmha sorumluları'],
    ['/imha/kayitlar', 'İmha işlemi kayıtları'],
  ];
  const active = (href: string) =>
    href === '/imha' ? !tabs.slice(1).some(([h]) => pathname.startsWith(h)) : pathname.startsWith(href);
  return (
    <nav className="tabs" aria-label="İmha yönetimi">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={`tab${active(href) ? ' active' : ''}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

const PLAN_KIND: Record<DestructionPlanStatus, 'warning' | 'success' | 'danger' | undefined> = {
  draft: undefined,
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function planStatusBadge(status: DestructionPlanStatus) {
  return <Badge kind={PLAN_KIND[status]}>{DESTRUCTION_PLAN_STATUSES[status]}</Badge>;
}

const ITEM_KIND: Record<DestructionItemStatus, 'success' | 'info' | undefined> = {
  planned: 'info',
  done: 'success',
  cancelled: undefined,
};

export function itemStatusBadge(item: Pick<DestructionItem, 'status' | 'overdue'>) {
  if (item.overdue) return <Badge kind="danger">Tarihi geçti</Badge>;
  return <Badge kind={ITEM_KIND[item.status]}>{DESTRUCTION_ITEM_STATUSES[item.status]}</Badge>;
}

export const operationLabel = (op: DestructionOperation) => DESTRUCTION_OPERATIONS[op];
export const mediumLabel = (m: StorageMedium | null) => (m ? STORAGE_MEDIA[m] : '—');

export function OperationSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: DestructionOperation) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as DestructionOperation)} required>
      {(Object.keys(DESTRUCTION_OPERATIONS) as DestructionOperation[]).map((o) => (
        <option key={o} value={o}>
          {DESTRUCTION_OPERATIONS[o]}
        </option>
      ))}
    </select>
  );
}

export function MediumSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seçilmedi</option>
      {(Object.keys(STORAGE_MEDIA) as StorageMedium[]).map((m) => (
        <option key={m} value={m}>
          {STORAGE_MEDIA[m]}
        </option>
      ))}
    </select>
  );
}

const officerPeriod = (o: DestructionOfficer) =>
  `${formatDay(o.startDate)} – ${o.endDate ? formatDay(o.endDate) : 'devam ediyor'}`;

/** İmha sorumlusu seçimi; boş bırakılırsa ilgili tarihteki dönemin sorumlusu atanır. */
export function OfficerSelect({
  id,
  value,
  onChange,
  emptyLabel = 'Tarihteki dönemin sorumlusu',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  emptyLabel?: string;
}) {
  const officers = useApi<{ items: DestructionOfficer[] }>('destruction/officers');
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{officers.loading ? 'Yükleniyor…' : emptyLabel}</option>
      {(officers.data?.items ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.fullName}
          {o.title ? ` (${o.title})` : ''} · {officerPeriod(o)}
        </option>
      ))}
    </select>
  );
}

const entryText = (e: InventoryEntry) => `${e.department} / ${e.activity} / ${e.dataCategory}`;

/** Plana tek bir imha işi ekleme veya planlanan işi düzenleme penceresi. */
export function ItemDialog({
  planId,
  item,
  defaultDate,
  onClose,
  onSaved,
}: {
  planId: string;
  item?: DestructionItem;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inventory = useApi<{ items: InventoryEntry[] }>('inventory');
  const [entryId, setEntryId] = useState(item?.inventoryEntryId ?? '');
  const [description, setDescription] = useState(item?.dataDescription ?? '');
  const [medium, setMedium] = useState<string>(item?.storageMedium ?? '');
  const [retention, setRetention] = useState(item?.retentionPeriod ?? '');
  const [plannedDate, setPlannedDate] = useState(item?.plannedDate ?? defaultDate);
  const [operation, setOperation] = useState<DestructionOperation>(item?.operationType ?? 'deletion');
  const [method, setMethod] = useState(item?.method ?? '');
  const [officerId, setOfficerId] = useState(item?.officerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickEntry(id: string) {
    setEntryId(id);
    const e = inventory.data?.items.find((x) => x.id === id);
    if (!e) return;
    setDescription(entryText(e));
    setMedium(e.storageMedium ?? '');
    setRetention(e.retentionPeriod ?? '');
    setOperation(e.storageMedium === 'physical' ? 'destruction' : 'deletion');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      inventoryEntryId: entryId || null,
      dataDescription: description.trim(),
      storageMedium: medium || null,
      retentionPeriod: retention.trim() || null,
      plannedDate,
      operationType: operation,
      method: method.trim() || null,
      ...(item ? { officerId: officerId || null } : officerId ? { officerId } : {}),
    };
    try {
      if (item) await api(`destruction/items/${item.id}`, { method: 'PATCH', body });
      else await api(`destruction/plans/${planId}/items`, { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? 'Planlanan imhayı düzenle' : 'Plana imha işi ekle'}>
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        <Field label="Veri envanteri satırı" htmlFor="it-entry" hint="Seçilirse veri, kayıt ortamı ve saklama süresi envanterden gelir.">
          <select id="it-entry" value={entryId} onChange={(e) => pickEntry(e.target.value)}>
            <option value="">{inventory.loading ? 'Yükleniyor…' : 'Envanterden seçilmedi'}</option>
            {(inventory.data?.items ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {entryText(e)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="İmha edilecek veri" htmlFor="it-desc" required>
          <textarea id="it-desc" value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={1000} />
        </Field>
        <div className="form-row">
          <Field label="Kayıt ortamı" htmlFor="it-medium">
            <MediumSelect id="it-medium" value={medium} onChange={setMedium} />
          </Field>
          <Field label="Saklama süresi" htmlFor="it-ret">
            <input id="it-ret" value={retention} onChange={(e) => setRetention(e.target.value)} maxLength={500} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Planlanan imha tarihi" htmlFor="it-date" required>
            <input id="it-date" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} required />
          </Field>
          <Field label="İşlem türü" htmlFor="it-op" required>
            <OperationSelect id="it-op" value={operation} onChange={setOperation} />
          </Field>
        </div>
        <Field label="Planlanan yöntem" htmlFor="it-method" hint="Ör. kağıt imha makinesi, veritabanından kalıcı silme, maskeleme.">
          <textarea id="it-method" value={method} onChange={(e) => setMethod(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="İmha sorumlusu" htmlFor="it-officer">
          <OfficerSelect id="it-officer" value={officerId} onChange={setOfficerId} emptyLabel={item ? 'Atanmamış' : 'Tarihteki dönemin sorumlusu'} />
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

/** Planlanan imhanın gerçekleştiğini kaydeder; imha işlemi kaydı açılır. */
export function CompleteDialog({ item, onClose, onSaved }: { item: DestructionItem; onClose: () => void; onSaved: () => void }) {
  const [performedDate, setPerformedDate] = useState(todayIso());
  const [operation, setOperation] = useState<DestructionOperation>(item.operationType);
  const [note, setNote] = useState(item.method ?? '');
  const [officerId, setOfficerId] = useState(item.officerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`destruction/items/${item.id}/complete`, {
        method: 'POST',
        body: { performedDate, operationType: operation, performedNote: note.trim(), officerId: officerId || null },
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="İmha gerçekleşti">
      <p className="muted small">{item.dataDescription}</p>
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        <div className="form-row">
          <Field label="Gerçekleşme tarihi" htmlFor="c-date" required>
            <input id="c-date" type="date" value={performedDate} max={todayIso()} onChange={(e) => setPerformedDate(e.target.value)} required />
          </Field>
          <Field label="İşlem türü" htmlFor="c-op" required>
            <OperationSelect id="c-op" value={operation} onChange={setOperation} />
          </Field>
        </div>
        <Field label="Yapılan işlem" htmlFor="c-note" required hint="Kullanılan yöntem, araç, tutanak numarası gibi bilgiler.">
          <textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} required minLength={2} maxLength={5000} />
        </Field>
        <Field label="İmha sorumlusu" htmlFor="c-officer">
          <OfficerSelect id="c-officer" value={officerId} onChange={setOfficerId} />
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
