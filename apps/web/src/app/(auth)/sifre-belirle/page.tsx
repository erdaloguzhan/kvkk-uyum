'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';

/** Şifre sıfırlama ve davet edilen kullanıcının ilk şifresini belirlemesi (e-postadaki kodla). */
export default function SetPasswordPage() {
  const [token, setToken] = useState('');
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
    <AuthCard title="Şifre belirle" subtitle="E-postanızdaki kodu girin ve yeni şifrenizi belirleyin.">
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
          <Field label="E-postadaki kod" htmlFor="token">
            <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus autoComplete="off" />
          </Field>
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
        <Link href="/giris">← Girişe dön</Link>
      </div>
    </AuthCard>
  );
}
