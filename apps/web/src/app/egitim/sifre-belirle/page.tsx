'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { PORTAL_BRAND } from '@/components/portal-shell';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { portalApi } from '@/lib/portal-api';

/** "Şifremi unuttum" e-postasındaki bağlantı (`?kod=`) bu sayfayı açar. */
export default function PortalSetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const kod = new URLSearchParams(window.location.search).get('kod');
    if (!kod) return;
    setToken(kod);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== password2 ? 'Şifreler aynı değil' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await portalApi('password-reset/confirm', { method: 'POST', body: { token, password }, redirect: false });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={PORTAL_BRAND} title="Yeni şifre belirle">
      {done ? (
        <>
          <Alert kind="success">Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.</Alert>
          <Link className="btn btn-primary" href="/egitim">
            Giriş yap
          </Link>
        </>
      ) : !token ? (
        <Alert kind="warning">Bağlantı eksik. Lütfen e-postadaki bağlantıyı açın veya yeniden şifre sıfırlama isteyin.</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <Field label="Yeni şifre" htmlFor="password" hint={PASSWORD_HINT}>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Yeni şifre (tekrar)" htmlFor="password2">
            <input id="password2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </Field>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/egitim">← Girişe dön</Link>
      </div>
    </AuthCard>
  );
}
