'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { PORTAL_BRAND } from '@/components/portal-shell';
import { ErrorAlert, Field } from '@/components/ui';
import { errorText } from '@/lib/api';
import { solveCaptcha } from '@/lib/captcha';
import { portalApi } from '@/lib/portal-api';

type Account = { email: string; mustChangePassword: boolean };

/** Eğitim Portalı girişi: kullanıcı adı cep telefonu, şifre e-postayla gönderilir. */
export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (account: Account) => router.replace(account.mustChangePassword ? '/egitim/sifre-degistir' : '/egitim/panel');

  useEffect(() => {
    // Oturum açıksa doğrudan eğitimlere geçilir.
    portalApi<Account>('me', { redirect: false }).then(go, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi<{ account: Account }>('login', { method: 'POST', body: { phone, password, captchaToken: await solveCaptcha() }, redirect: false });
      go(res.account);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={PORTAL_BRAND} title="Giriş" subtitle="Cep telefonunuz ve size e-postayla gönderilen şifreyle giriş yapın.">
      <form className="form" onSubmit={submit}>
        <ErrorAlert error={error} />
        <Field label="Cep telefonu" htmlFor="phone">
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="05XX XXX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Şifre" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
      <div className="auth-links">
        <Link href="/egitim/sifremi-unuttum">Şifremi unuttum</Link>
      </div>
    </AuthCard>
  );
}
