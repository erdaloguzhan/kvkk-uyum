'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { PORTAL_BRAND } from '@/components/portal-shell';
import { ErrorAlert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { solveCaptcha } from '@/lib/captcha';
import { portalApi } from '@/lib/portal-api';

/** Eğitim Portalı girişi: şifre yoktur; cep telefonu yazılır, SMS ile gelen kodla girilir. */
export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; destination: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Oturum açıksa doğrudan eğitimlere geçilir.
    portalApi('me', { redirect: false }).then(() => router.replace('/egitim/panel'), () => undefined);
  }, [router]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi<{ challengeId: string; destination: string }>('login/code', {
        method: 'POST',
        body: { phone, captchaToken: await solveCaptcha() },
        redirect: false,
      });
      setChallenge({ id: res.challengeId, destination: res.destination });
      setCode('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi('login', { method: 'POST', body: { challengeId: challenge!.id, code }, redirect: false });
      router.replace('/egitim/panel');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthCard
        brand={PORTAL_BRAND}
        title="SMS kodu"
        subtitle={<>Telefon kayıtlıysa {challenge.destination} numarasına 6 haneli bir kod gönderdik. Kod 5 dakika geçerlidir.</>}
      >
        <form className="form" onSubmit={submitCode}>
          <ErrorAlert error={error} />
          <Field label="Kod" htmlFor="code">
            <input
              id="code"
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </Field>
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Kontrol ediliyor…' : 'Giriş yap'}
          </button>
        </form>
        <div className="auth-links">
          <button type="button" className="btn-link" onClick={() => setChallenge(null)}>
            ← Geri dön
          </button>
          <button type="button" className="btn-link" onClick={() => requestCode()} disabled={busy}>
            Kodu yeniden gönder
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard brand={PORTAL_BRAND} title="Giriş" subtitle="Cep telefonunuzu yazın; telefonunuza SMS ile bir giriş kodu göndereceğiz.">
      <form className="form" onSubmit={requestCode}>
        <ErrorAlert error={error} />
        <Field label="Cep telefonu" htmlFor="phone">
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05XX XXX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Kod gönder'}
        </button>
      </form>
    </AuthCard>
  );
}
