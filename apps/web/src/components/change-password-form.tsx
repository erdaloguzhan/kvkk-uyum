'use client';

import { FormEvent, useState } from 'react';
import { api, ApiError, ApiErrorBody, errorText, redirectToLogin } from '@/lib/api';
import { useSession } from '@/lib/session';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { Alert, ErrorAlert, Field, PageHeader } from './ui';

/** Şifre değişikliği /api/session üzerinden yapılır: oturumun yeni belirteçleri çerezlere yazılır. */
async function changePassword(body: { currentPassword: string; newPassword: string }) {
  const send = () =>
    fetch('/api/session/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401) {
      const refreshed = await fetch('/api/session/refresh', { method: 'POST' }).then((r) => r.ok);
      if (!refreshed) {
        redirectToLogin();
        throw new ApiError(401, { message: 'Oturum süresi doldu, tekrar giriş yapın' });
      }
      res = await send();
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, { message: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' });
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))) as ApiErrorBody);
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const problem =
      passwordProblem(password) ??
      (password !== password2 ? 'Yeni şifreler aynı değil' : null) ??
      (password === current ? 'Yeni şifre mevcut şifreden farklı olmalı' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await changePassword({ currentPassword: current, newPassword: password });
      setDone(true);
      setCurrent('');
      setPassword('');
      setPassword2('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} style={{ maxWidth: 420 }}>
      {done && (
        <Alert kind="success">
          Şifreniz değiştirildi. Güvenliğiniz için diğer cihaz ve tarayıcılardaki oturumlarınız kapatıldı.
        </Alert>
      )}
      <ErrorAlert error={error} />
      <Field label="Mevcut şifre" htmlFor="current-password" required>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>
      <Field label="Yeni şifre" htmlFor="new-password" hint={PASSWORD_HINT} required>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <Field label="Yeni şifre (tekrar)" htmlFor="new-password2" required>
        <input
          id="new-password2"
          type="password"
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          required
        />
      </Field>
      <div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
        </button>
      </div>
    </form>
  );
}

/** Profil sayfası: hesap bilgileri ve şifre değiştirme (müşteri ekranı ve yönetim panelinde ortak). */
/** Giriş doğrulama kodunun SMS ile gideceği cep telefonu. */
function PhoneForm({ phone }: { phone: string | null }) {
  const { reload } = useSession();
  const [value, setValue] = useState(phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('auth/me/phone', { method: 'PATCH', body: { phone: value.trim() || null } });
      await reload();
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <ErrorAlert error={error} />
      {saved && <Alert kind="success">Cep telefonu kaydedildi. E-posta adresinize bilgilendirme gönderildi.</Alert>}
      <Field
        label="Cep telefonu"
        htmlFor="profile-phone"
        hint="Girişte doğrulama kodu bu numaraya SMS ile gider. Boş bırakırsanız kod e-posta adresinize gider."
      >
        <input id="profile-phone" type="tel" placeholder="05XX XXX XX XX" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}

export function ProfilePage({ fullName, email, phone, role }: { fullName: string; email: string; phone: string | null; role?: string }) {
  return (
    <>
      <PageHeader title="Profilim" description="Hesap bilgileriniz ve şifreniz." />
      <div className="card">
        <h2>Hesap</h2>
        <dl className="details">
          <dt>Ad soyad</dt>
          <dd>{fullName}</dd>
          <dt>E-posta</dt>
          <dd>{email}</dd>
          {role && (
            <>
              <dt>Rol</dt>
              <dd>{role}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="card">
        <h2>Cep telefonu</h2>
        <PhoneForm phone={phone} />
      </div>
      <div className="card">
        <h2>Şifre değiştir</h2>
        <ChangePasswordForm />
      </div>
    </>
  );
}
