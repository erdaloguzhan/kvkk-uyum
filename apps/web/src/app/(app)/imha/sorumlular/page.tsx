'use client';

import { PERMISSIONS } from '@kvkk/shared';
import { useState } from 'react';
import { DestructionTabs } from '@/components/destruction';
import { ExportButton } from '@/components/export-button';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDay, todayIso } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { DestructionOfficer } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** İmha sorumluları: güncel sorumlu ve geçmiş dönemlerin sorumluları. */
export default function DestructionOfficersPage() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.DESTRUCTION_MANAGE);
  const officers = useApi<{ items: DestructionOfficer[] }>('destruction/officers');
  const [dialog, setDialog] = useState<{ officer?: DestructionOfficer; past?: boolean } | null>(null);
  const items = officers.data?.items ?? [];
  const current = items.find((o) => o.current);

  return (
    <>
      <PageHeader
        title="Kişisel veri imha yönetimi"
        description="İmha sorumluları dönem dönem tutulur. Yeni sorumlu atandığında öncekinin dönemi kapanır, kaydı silinmez."
        actions={
          canManage && (
            <>
              <button className="btn" onClick={() => setDialog({ past: true })}>
                Geçmiş dönem ekle
              </button>
              <button className="btn btn-primary" onClick={() => setDialog({})}>
                + Yeni imha sorumlusu
              </button>
            </>
          )
        }
      />
      <DestructionTabs />
      <ErrorAlert error={officers.error} />
      {officers.data && !current && (
        <Alert kind="warning">Güncel bir imha sorumlusu yok. Planlanan imhalara sorumlu atanabilmesi için sorumlu belirleyin.</Alert>
      )}
      {officers.loading && !officers.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Henüz imha sorumlusu belirlenmedi" />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <ExportButton
              fileName="imha-sorumlulari"
              rows={items}
              columns={[
                { label: 'Ad soyad', value: (o) => o.fullName },
                { label: 'Unvan', value: (o) => o.title },
                { label: 'Başlangıç tarihi', value: (o) => formatDay(o.startDate) },
                { label: 'Bitiş tarihi', value: (o) => (o.endDate ? formatDay(o.endDate) : 'Devam ediyor') },
                { label: 'Not', value: (o) => o.note },
              ]}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ad soyad</th>
                  <th>Unvan</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>Durum</th>
                  <th>Not</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>{o.fullName}</td>
                    <td>{o.title ?? '—'}</td>
                    <td className="nowrap">{formatDay(o.startDate)}</td>
                    <td className="nowrap">{o.endDate ? formatDay(o.endDate) : <span className="muted">Devam ediyor</span>}</td>
                    <td>
                      {o.current ? (
                        <Badge kind="success">Güncel sorumlu</Badge>
                      ) : o.startDate > todayIso() ? (
                        <Badge kind="info">Başlayacak</Badge>
                      ) : (
                        <Badge>Geçmiş dönem</Badge>
                      )}
                    </td>
                    <td className="small">{o.note ?? '—'}</td>
                    {canManage && (
                      <td>
                        <button className="btn btn-small" onClick={() => setDialog({ officer: o })}>
                          Düzelt
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {dialog && (
        <OfficerDialog
          officer={dialog.officer}
          past={dialog.past}
          current={current}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            officers.reload();
          }}
        />
      )}
    </>
  );
}

function OfficerDialog({
  officer,
  past,
  current,
  onClose,
  onSaved,
}: {
  officer?: DestructionOfficer;
  past?: boolean;
  current?: DestructionOfficer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const employees = useApi<{ items: { id: string; fullName: string }[] }>('destruction/employees');
  const [employeeId, setEmployeeId] = useState(officer?.employeeId ?? '');
  const [fullName, setFullName] = useState(officer?.fullName ?? '');
  const [title, setTitle] = useState(officer?.title ?? '');
  const [startDate, setStartDate] = useState(officer?.startDate ?? (past ? '' : todayIso()));
  const [endDate, setEndDate] = useState(officer?.endDate ?? '');
  const [note, setNote] = useState(officer?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showEnd = !!officer || past;

  function pickEmployee(id: string) {
    setEmployeeId(id);
    const e = employees.data?.items.find((x) => x.id === id);
    if (e) setFullName(e.fullName);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      employeeId: employeeId || null,
      fullName: fullName.trim(),
      title: title.trim() || null,
      startDate,
      ...(showEnd ? { endDate: endDate || null } : {}),
      note: note.trim() || null,
    };
    try {
      if (officer) await api(`destruction/officers/${officer.id}`, { method: 'PATCH', body });
      else await api('destruction/officers', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={officer ? 'İmha sorumlusu kaydını düzelt' : past ? 'Geçmiş dönem sorumlusu' : 'Yeni imha sorumlusu'}>
      <form className="form" onSubmit={save}>
        <ErrorAlert error={error} />
        {!officer && !past && current && (
          <Alert kind="info">
            Güncel sorumlu {current.fullName}. Kayıt edilince onun dönemi yeni sorumlunun başlangıcından bir gün önce kapanır ve geçmişte saklanır.
          </Alert>
        )}
        <Field label="Çalışanlar listesinden seç" htmlFor="o-emp" hint="Listede yoksa ad soyadı aşağıya elle yazın.">
          <select id="o-emp" value={employeeId} onChange={(e) => pickEmployee(e.target.value)}>
            <option value="">{employees.loading ? 'Yükleniyor…' : 'Seçilmedi'}</option>
            {(employees.data?.items ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-row">
          <Field label="Ad soyad" htmlFor="o-name" required>
            <input
              id="o-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={200}
              disabled={!!employeeId}
            />
          </Field>
          <Field label="Unvan / görevi" htmlFor="o-title">
            <input id="o-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Başlangıç tarihi" htmlFor="o-start" required>
            <input id="o-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          {showEnd && (
            <Field label="Bitiş tarihi" htmlFor="o-end" required={past} hint={officer ? 'Boşsa dönem devam ediyor.' : undefined}>
              <input id="o-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required={past} />
            </Field>
          )}
        </div>
        <Field label="Not" htmlFor="o-note" hint="Ör. görevlendirme yazısının tarihi ve sayısı.">
          <textarea id="o-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
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
