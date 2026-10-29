'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import type { AdminOrganization } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const LICENSE: Record<AdminOrganization['licenseStatus'], { label: string; kind?: 'success' | 'warning' | 'danger' }> = {
  trial: { label: 'Deneme', kind: 'warning' },
  active: { label: 'Aktif', kind: 'success' },
  expired: { label: 'Süresi doldu', kind: 'danger' },
};

export default function AdminOrganizationsPage() {
  const orgs = useApi<{ items: AdminOrganization[] }>('admin/organizations');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [licenseOrg, setLicenseOrg] = useState<AdminOrganization | null>(null);

  if (orgs.loading && !orgs.data) return <Loading />;
  const items = orgs.data?.items ?? [];

  async function resend(o: AdminOrganization) {
    if (!confirm(`${o.email} adresine yeni bir şifre oluşturma bağlantısı gönderilsin mi? Önceki bağlantı geçersiz olur.`)) return;
    setBusy(o.id);
    setError(null);
    setMessage(null);
    try {
      const r = await api<{ email: string }>(`admin/organizations/${o.id}/resend-invite`, { method: 'POST' });
      setMessage(`Şifre oluşturma bağlantısı ${r.email} adresine gönderildi.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Kuruluşlar"
        description="Sisteme eklenen müşteri kuruluşları. Yeni kuruluş eklendiğinde kayıttaki e-postaya şifre oluşturma bağlantısı gider. Çalışan listesini (eğitim katılımcıları) kuruluşun sayfasından yönetin."
        actions={
          <Link className="btn btn-primary" href="/admin/kuruluslar/yeni">
            + Yeni kuruluş
          </Link>
        }
      />
      <ErrorAlert error={orgs.error ?? error} />
      {message && <Alert kind="success">{message}</Alert>}
      <div className="card">
        {items.length === 0 ? (
          <Empty title="Henüz kuruluş yok">Yukarıdaki düğmeyle ilk kuruluşu ekleyin.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kuruluş</th>
                  <th>Yetkili</th>
                  <th>E-posta</th>
                  <th>Kullanıcı</th>
                  <th>Lisans</th>
                  <th>Eklendi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/kuruluslar/${o.id}`}>{o.name}</Link>
                      {!o.setupCompletedAt && (
                        <div>
                          <Badge kind="warning">Bilgileri eksik</Badge>
                        </div>
                      )}
                    </td>
                    <td>{o.authorizedPerson ?? '—'}</td>
                    <td>{o.email ?? '—'}</td>
                    <td>{o.memberCount}</td>
                    <td>
                      <Badge kind={LICENSE[effectiveStatus(o)].kind}>{LICENSE[effectiveStatus(o)].label}</Badge>
                      {o.licenseExpiresAt && <div className="small muted">{formatDate(o.licenseExpiresAt)}</div>}
                    </td>
                    <td className="nowrap">{formatDate(o.createdAt)}</td>
                    <td className="nowrap">
                      <Link className="btn btn-small" href={`/admin/kuruluslar/${o.id}`}>
                        Çalışanlar
                      </Link>{' '}
                      <button className="btn btn-small" onClick={() => setLicenseOrg(o)} disabled={busy !== null}>
                        Lisans
                      </button>{' '}
                      {o.email && (
                        <button className="btn btn-small" onClick={() => resend(o)} disabled={busy !== null}>
                          {busy === o.id ? 'Gönderiliyor…' : 'Daveti yeniden gönder'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {licenseOrg && (
        <LicenseDialog
          org={licenseOrg}
          onClose={() => setLicenseOrg(null)}
          onSaved={() => {
            setMessage(`${licenseOrg.name} lisansı güncellendi.`);
            setLicenseOrg(null);
            orgs.reload();
          }}
        />
      )}
    </>
  );
}

/** Bitiş tarihi geçmişse durum "Deneme" veya "Aktif" görünse de süre dolmuştur. */
function effectiveStatus(o: AdminOrganization): AdminOrganization['licenseStatus'] {
  return o.licenseExpiresAt && new Date(o.licenseExpiresAt).getTime() < Date.now() ? 'expired' : o.licenseStatus;
}

/** ISO zamanı İstanbul saatine göre YYYY-AA-GG gününe çevirir (tarih kutusu için). */
function istanbulDay(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

function LicenseDialog({ org, onClose, onSaved }: { org: AdminOrganization; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(org.licenseStatus);
  const [expiresAt, setExpiresAt] = useState(org.licenseExpiresAt ? istanbulDay(org.licenseExpiresAt) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`admin/organizations/${org.id}/license`, { method: 'PATCH', body: { status, expiresAt: expiresAt || null } });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Lisans: ${org.name}`}>
      <p className="muted">
        Bitiş tarihi geçince veya durum &quot;Süresi doldu&quot; yapılınca kuruluş kullanıcıları kayıtlarını görebilir ve indirebilir, ama
        değişiklik yapamaz. Çalışan eğitim portalı ve ilgili kişi başvuru formu çalışmaya devam eder.
      </p>
      <form className="form" onSubmit={submit}>
        <ErrorAlert error={error} />
        <Field label="Durum" htmlFor="license-status">
          <select id="license-status" value={status} onChange={(e) => setStatus(e.target.value as AdminOrganization['licenseStatus'])}>
            <option value="trial">Deneme</option>
            <option value="active">Aktif</option>
            <option value="expired">Süresi doldu</option>
          </select>
        </Field>
        <Field label="Son geçerli gün" htmlFor="license-expires" hint={status === 'trial' ? 'Deneme için zorunlu.' : 'Boş bırakılırsa süresizdir.'}>
          <input id="license-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required={status === 'trial'} />
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
