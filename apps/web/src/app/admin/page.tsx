'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
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
        description="Sisteme eklenen müşteri kuruluşları. Yeni kuruluş eklendiğinde kayıttaki e-postaya şifre oluşturma bağlantısı gider."
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
                      {o.name}
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
                      <Badge kind={LICENSE[o.licenseStatus].kind}>{LICENSE[o.licenseStatus].label}</Badge>
                      {o.licenseExpiresAt && <div className="small muted">{formatDate(o.licenseExpiresAt)}</div>}
                    </td>
                    <td className="nowrap">{formatDate(o.createdAt)}</td>
                    <td className="nowrap">
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
    </>
  );
}
