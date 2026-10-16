'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { PORTAL_BRAND } from '@/components/portal-shell';
import { Alert, ErrorAlert, Field, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { portalApi } from '@/lib/portal-api';

/** İlk girişte (geçici şifre) zorunlu, sonrasında isteğe bağlı şifre değiştirme. */
export default function PortalChangePasswordPage() {
  const router = useRouter();
  const [account, setAccount] = useState<{ mustChangePassword: boolean } | null>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi<{ mustChangePassword: boolean }>('me').then(setAccount, () => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== password2 ? 'Yeni şifreler aynı değil' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await portalApi('change-password', { method: 'POST', body: { currentPassword: current, newPassword: password }, redirect: false });
      router.replace('/egitim/panel');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (!account) return <Loading />;
  return (
    <AuthCard brand={PORTAL_BRAND} title="Şifre değiştir">
      {account.mustChangePassword && (
        <Alert kind="info">İlk girişiniz. Devam etmek için e-postadaki geçici şifrenin yerine kendi şifrenizi belirleyin.</Alert>
      )}
      <form className="form" onSubmit={submit}>
        <ErrorAlert error={error} />
        <Field label={account.mustChangePassword ? 'Geçici şifre' : 'Mevcut şifre'} htmlFor="current">
          <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
        </Field>
        <Field label="Yeni şifre" htmlFor="password" hint={PASSWORD_HINT}>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Yeni şifre (tekrar)" htmlFor="password2">
          <input id="password2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
        </button>
        {!account.mustChangePassword && (
          <button type="button" className="btn" onClick={() => router.push('/egitim/panel')}>
            Vazgeç
          </button>
        )}
      </form>
    </AuthCard>
  );
}
