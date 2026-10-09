'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('auth/password-reset/request', { method: 'POST', body: { email }, auth: false });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Şifremi unuttum" subtitle="E-posta adresinize şifre sıfırlama kodu gönderelim.">
      {sent ? (
        <>
          <Alert kind="success">Bu adresle kayıtlı bir hesap varsa sıfırlama kodu gönderildi. Kod 1 saat geçerlidir.</Alert>
          <Link className="btn btn-primary" href="/sifre-belirle">
            Kodu girip yeni şifre belirle
          </Link>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <Field label="E-posta" htmlFor="email">
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Kod gönder'}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/giris">← Girişe dön</Link>
      </div>
    </AuthCard>
  );
}
