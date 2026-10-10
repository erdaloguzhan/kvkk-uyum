'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';

/**
 * Şifre sıfırlama ve yeni hesabın ilk şifresini oluşturma. E-postadaki bağlantı kodu adres satırında
 * (`?kod=`) getirir; bağlantı açılmazsa kod elle de girilebilir.
 */
export default function SetPasswordPage() {
  const [token, setToken] = useState('');
  const [fromLink, setFromLink] = useState(false);

  useEffect(() => {
    const kod = new URLSearchParams(window.location.search).get('kod');
    if (!kod) return;
    setToken(kod);
    setFromLink(true);
    // Kod tarayıcı geçmişinde kalmasın.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== password2 ? 'Şifreler aynı değil' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api('auth/password-reset/confirm', { method: 'POST', body: { token: token.trim(), password }, auth: false });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Şifre belirle"
      subtitle={fromLink ? 'Hesabınız için bir şifre oluşturun.' : 'E-postanızdaki kodu girin ve yeni şifrenizi belirleyin.'}
    >
      {done ? (
        <>
          <Alert kind="success">Şifreniz kaydedildi. Artık giriş yapabilirsiniz.</Alert>
          <Link className="btn btn-primary" href="/giris">
            Giriş yap
          </Link>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          {error && fromLink && (
            <p className="small muted">
              Bağlantının süresi dolduysa <Link href="/sifremi-unuttum">yeni bağlantı isteyin</Link>.
            </p>
          )}
          {!fromLink && (
            <Field label="E-postadaki kod" htmlFor="token">
              <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus autoComplete="off" />
            </Field>
          )}
          <Field label="Yeni şifre" htmlFor="password" hint={PASSWORD_HINT}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={fromLink}
            />
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
        <Link href="/giris">← Girişe dön</Link>
      </div>
    </AuthCard>
  );
}
