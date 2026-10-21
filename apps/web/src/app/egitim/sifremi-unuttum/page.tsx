'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { PORTAL_BRAND } from '@/components/portal-shell';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { solveCaptcha } from '@/lib/captcha';
import { portalApi } from '@/lib/portal-api';

export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi('password-reset/request', { method: 'POST', body: { email, captchaToken: await solveCaptcha() }, redirect: false });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={PORTAL_BRAND} title="Şifremi unuttum" subtitle="E-posta adresinize şifre sıfırlama bağlantısı gönderelim.">
      {sent ? (
        <Alert kind="success">Bu adresle kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi. Bağlantı 1 saat geçerlidir.</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <Field label="E-posta" htmlFor="email">
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Bağlantı gönder'}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/egitim">← Girişe dön</Link>
      </div>
    </AuthCard>
  );
}
