'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { OrgUsers } from '@/components/org-users';
import { emptyPerson, PersonFields, PersonForm, toPersonForm } from '@/components/person-fields';
import { Alert, Badge, Empty, ErrorAlert, Loading, Modal, PageHeader } from '@/components/ui';
import { api, ApiError, download, errorText } from '@/lib/api';
import { formatDay } from '@/lib/labels';
import type { AdminOrganization, Employee } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type ImportCheck = { file: File; created: number; updated: number };

/** Kuruluş sayfası (yönetim paneli): çalışan listesi, ekleme/düzenleme ve Excel'den içe aktarma. */
export default function AdminOrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const orgs = useApi<{ items: AdminOrganization[] }>('admin/organizations');
  const list = useApi<{ items: Employee[] }>(`admin/organizations/${id}/employees`);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyPerson);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ row: number; column?: string; message: string }[]>([]);
  const [importCheck, setImportCheck] = useState<ImportCheck | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const org = orgs.data?.items.find((o) => o.id === id);
  if ((list.loading && !list.data) || (orgs.loading && !orgs.data)) return <Loading />;
  const items = (list.data?.items ?? []).filter((e) =>
    `${e.firstName} ${e.lastName} ${e.nationalId} ${e.email ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')),
  );

  function open(e: Employee | 'new') {
    setEditing(e);
    setForm(e === 'new' ? emptyPerson : toPersonForm(e));
    setFormError(null);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setFormError(null);
    const body = { ...form, hireDate: form.hireDate || null, terminationDate: form.terminationDate || null, phone: form.phone || null, email: form.email || null };
    try {
      if (editing === 'new') {
        await api(`admin/organizations/${id}/employees`, { method: 'POST', body });
      } else if (editing) {
        await api(`admin/organizations/${id}/employees/${editing.id}`, { method: 'PATCH', body });
      }
      setEditing(null);
      await list.reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Employee) {
    if (!confirm(`${e.firstName} ${e.lastName} silinsin mi?`)) return;
    setError(null);
    try {
      await api(`admin/organizations/${id}/employees/${e.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function runImport(file: File, dryRun: boolean) {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setError(null);
    setImportErrors([]);
    setMessage(null);
    try {
      const r = await api<{ created: number; updated: number }>(`admin/organizations/${id}/employees/import`, {
        method: 'POST',
        body: fd,
        query: { dryRun },
      });
      if (dryRun) {
        setImportCheck({ file, ...r });
      } else {
        setImportCheck(null);
        setMessage(`${r.created} çalışan eklendi, ${r.updated} çalışan güncellendi.`);
        await list.reload();
      }
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.body.errors) setImportErrors(err.body.errors as typeof importErrors);
    } finally {
      setBusy(false);
    }
  }

  /** Çalışanlara Eğitim Portalı erişimi gönderir; çalışan yayınlanmış dokümanları portalda okur. */
  async function sendPortalAccess(e?: Employee) {
    const text = e
      ? `${e.firstName} ${e.lastName} için Eğitim Portalı erişimi gönderilsin mi?`
      : 'Cep telefonu ve e-postası olan, işten çıkmamış tüm çalışanlara Eğitim Portalı erişimi gönderilsin mi? Hesabı olmayanlara geçici şifre gider.';
    if (!confirm(text)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api<{ sent: number; skipped: { name: string; reason: string }[] }>(
        `admin/organizations/${id}/employees/portal-access`,
        { method: 'POST', body: e ? { employeeIds: [e.id] } : {} },
      );
      const skipped = r.skipped.map((x) => `${x.name} (${x.reason})`).join(', ');
      setMessage(`${r.sent} çalışana portal erişimi gönderildi.${skipped ? ` Gönderilmeyenler: ${skipped}.` : ''}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) runImport(file, true);
  }

  return (
    <>
      <PageHeader
        title={org?.name ?? 'Kuruluş'}
        description={
          <>
            <Link href="/admin">← Kuruluşlar</Link> · Sistem kullanıcıları ve çalışanlar. Çalışanlar yayınlanmış KVKK dokümanlarını Eğitim Portalında okur. Eğitim grupları bu listeden oluşturulur; eğitim
            gönderilecek çalışanın cep telefonu (portal kullanıcı adı) ve e-posta adresi olmalıdır.
          </>
        }
      />
      <OrgUsers orgId={id} />
      <div className="card-header" style={{ marginTop: 24 }}>
        <h2>Çalışanlar</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => open('new')}>
            + Çalışan ekle
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            Excel&apos;den içe aktar
          </button>
          <button className="btn" onClick={() => sendPortalAccess()} disabled={busy}>
            Tümüne portal erişimi gönder
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={pickFile} />
          <button className="btn btn-link" onClick={() => download(`admin/organizations/${id}/employees/import-template`, 'Çalışan listesi şablonu.xlsx')}>
            Boş şablonu indir
          </button>
        </div>
      </div>
      <ErrorAlert error={list.error ?? error} />
      {importErrors.length > 0 && (
        <Alert kind="error">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {importErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.row}. satır{e.column ? ` (${e.column})` : ''}: {e.message}
              </li>
            ))}
            {importErrors.length > 20 && <li>… ve {importErrors.length - 20} hata daha</li>}
          </ul>
        </Alert>
      )}
      {message && <Alert kind="success">{message}</Alert>}
      {importCheck && (
        <Alert kind="info">
          <p>
            <strong>{importCheck.file.name}</strong>: {importCheck.created} yeni çalışan eklenecek, {importCheck.updated} çalışanın
            bilgileri (T.C. kimlik no eşleşen) güncellenecek.
          </p>
          <div className="actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => runImport(importCheck.file, false)}>
              İçe aktar
            </button>
            <button className="btn" onClick={() => setImportCheck(null)}>
              Vazgeç
            </button>
          </div>
        </Alert>
      )}
      <div className="toolbar">
        <input type="search" placeholder="Ad, T.C. no veya e-posta ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{items.length} çalışan</span>
        <span style={{ marginLeft: 'auto' }}>
          <ExportButton
            fileName={`${org?.name ?? 'Kuruluş'} - Çalışanlar`}
            rows={items}
            columns={[
              { label: 'T.C. Kimlik No', value: (e) => e.nationalId },
              { label: 'Adı', value: (e) => e.firstName },
              { label: 'Soyadı', value: (e) => e.lastName },
              { label: 'İşe Giriş Tarihi', value: (e) => (e.hireDate ? formatDay(e.hireDate) : null) },
              { label: 'İşten Çıkış Tarihi', value: (e) => (e.terminationDate ? formatDay(e.terminationDate) : null) },
              { label: 'Cep Telefonu', value: (e) => e.phone },
              { label: 'E-posta', value: (e) => e.email },
              { label: 'Eğitim sayısı', value: (e) => e.trainingCount },
            ]}
          />
        </span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <Empty title="Çalışan yok">Çalışanları tek tek ekleyin veya Excel dosyasından içe aktarın.</Empty>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>T.C. Kimlik No</th>
                  <th>Adı Soyadı</th>
                  <th>İşe giriş</th>
                  <th>İşten çıkış</th>
                  <th>Cep telefonu</th>
                  <th>E-posta</th>
                  <th>Eğitim</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{e.nationalId}</td>
                    <td>
                      {e.firstName} {e.lastName}
                      {e.terminationDate && (
                        <div>
                          <Badge>Ayrıldı</Badge>
                        </div>
                      )}
                    </td>
                    <td className="nowrap">{formatDay(e.hireDate)}</td>
                    <td className="nowrap">{formatDay(e.terminationDate)}</td>
                    <td className="nowrap">{e.phone ?? <Badge kind="warning">Yok</Badge>}</td>
                    <td>{e.email ?? <Badge kind="warning">Yok</Badge>}</td>
                    <td>{e.trainingCount}</td>
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => open(e)}>
                        Düzenle
                      </button>{' '}
                      {e.email && e.phone && !e.terminationDate && (
                        <>
                          <button className="btn btn-small" onClick={() => sendPortalAccess(e)} disabled={busy}>
                            Portal erişimi
                          </button>{' '}
                        </>
                      )}
                      <button className="btn btn-small btn-danger" onClick={() => remove(e)}>
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
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Yeni çalışan' : 'Çalışanı düzenle'}>
        <form className="form" onSubmit={save}>
          <ErrorAlert error={formError} />
          <PersonFields
            value={form}
            onChange={setForm}
            phoneHint="Eğitim Portalı kullanıcı adı olur; kişiye özel olmalı."
            emailHint="Portal şifresi ve şifre sıfırlama bağlantısı bu adrese gider."
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
