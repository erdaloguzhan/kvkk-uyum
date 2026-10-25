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
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi('password-reset/request', { method: 'POST', body: { phone, captchaToken: await solveCaptcha() }, redirect: false });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={PORTAL_BRAND} title="Şifremi unuttum" subtitle="Cep telefonunuzu yazın; kayıtlı e-posta adresinize şifre sıfırlama bağlantısı gönderelim.">
      {sent ? (
        <Alert kind="success">Bu telefonla kayıtlı bir hesap varsa kayıtlı e-posta adresinize sıfırlama bağlantısı gönderildi. Bağlantı 1 saat geçerlidir.</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorAlert error={error} />
          <Field label="Cep telefonu" htmlFor="phone">
            <input id="phone" type="tel" inputMode="tel" autoComplete="username" placeholder="05XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />
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
