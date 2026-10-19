'use client';

import { SYSTEM_ROLES } from '@kvkk/shared';
import { FormEvent, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { Member } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Alert, Badge, ErrorAlert, Field, Modal } from './ui';

const ROLE_HINTS: Record<string, string> = {
  officer_approver: 'Tüm KVKK işlerini yapar ve dokümanları kendisi onaylar.',
  kvkk_officer: 'Tüm KVKK işlerini yapar, dokümanları Yöneticinin onayına gönderir.',
  approver: 'Yalnızca kendisine gönderilen dokümanları onaylar veya reddeder.',
};

/**
 * Kuruluşun sistem kullanıcıları (yönetim paneli). Müşteri kullanıcı ekleyemediği için Sorumlu ve
 * Yönetici hesapları buradan eklenir, değiştirilir ve davetleri yeniden gönderilir.
 */
export function OrgUsers({ orgId }: { orgId: string }) {
  const base = `admin/organizations/${orgId}/members`;
  const list = useApi<{ items: Member[] }>(base);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', roleKey: 'approver' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function add(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api(base, { method: 'POST', body: form });
      setAdding(false);
      setMessage(`${form.email} eklendi ve bilgilendirildi.`);
      await list.reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Sistem kullanıcıları</h2>
        <button
          className="btn btn-small"
          onClick={() => {
            setForm({ fullName: '', email: '', roleKey: 'approver' });
            setFormError(null);
            setAdding(true);
          }}
        >
          + Kullanıcı ekle
        </button>
      </div>
      <p className="hint">
        KVKK Sorumlusu işi yürütür, Yönetici dokümanları onaylar. Çalışanlar yayınlanmış dokümanları ayrı hesap açılmadan
        Eğitim Portalında görür. Müşteri kullanıcı ekleyemez; değişiklikler buradan yapılır.
      </p>
      <ErrorAlert error={list.error ?? error} />
      {message && <Alert kind="success">{message}</Alert>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ad soyad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Durum</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.user.fullName}</td>
                <td>{m.user.email}</td>
                <td>
                  <select
                    aria-label="Rol"
                    value={m.role.key}
                    onChange={(e) => run(() => api(`${base}/${m.id}`, { method: 'PATCH', body: { roleKey: e.target.value } }), 'Rol değiştirildi.')}
                  >
                    {SYSTEM_ROLES.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{m.status === 'active' ? <Badge kind="success">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn btn-small"
                    onClick={() => run(() => api(`${base}/${m.id}/resend-invite`, { method: 'POST' }), `${m.user.email} adresine şifre oluşturma bağlantısı gönderildi.`)}
                  >
                    Bağlantı gönder
                  </button>{' '}
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      run(() => api(`${base}/${m.id}`, { method: 'PATCH', body: { status: m.status === 'active' ? 'disabled' : 'active' } }))
                    }
                  >
                    {m.status === 'active' ? 'Pasif yap' : 'Aktif yap'}
                  </button>{' '}
                  <button
                    className="btn btn-small btn-link"
                    onClick={() => confirm(`${m.user.fullName} kuruluştan çıkarılsın mı?`) && run(() => api(`${base}/${m.id}`, { method: 'DELETE' }))}
                  >
                    Çıkar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Kullanıcı ekle">
        <form className="form" onSubmit={add}>
          <ErrorAlert error={formError} />
          <Field label="Ad soyad" htmlFor="member-name" required>
            <input id="member-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} />
          </Field>
          <Field label="E-posta" htmlFor="member-email" required hint="Kullanıcı adı olur; hesabı yoksa şifre oluşturma bağlantısı gider.">
            <input id="member-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Rol" htmlFor="member-role" required hint={ROLE_HINTS[form.roleKey]}>
            <select id="member-role" value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
              {SYSTEM_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Vazgeç
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Ekleniyor…' : 'Ekle ve bilgilendir'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
