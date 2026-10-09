'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ErrorAlert, Field } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { useSession } from '@/lib/session';

function safeNext(value: string | null): string {
  // Yalnızca site içi adreslere yönlendirilir.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, reload } = useSession();
  const [email, setEmail] = useState(params.get('eposta') ?? '');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('sonra'));

  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  async function submitPassword(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ challengeId: string }>('auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setChallengeId(res.challengeId);
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
      const res = await fetch('/api/session/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
      const user = await reload();
      router.replace(user && user.organizations.length === 0 ? '/kurulus-olustur' : next);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (challengeId) {
    return (
      <AuthCard title="Doğrulama kodu" subtitle={<>{email} adresine 6 haneli bir kod gönderdik. Kod 10 dakika geçerlidir.</>}>
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
          <button type="button" className="btn-link" onClick={() => setChallengeId(null)}>
            ← Geri dön
          </button>
          <button type="button" className="btn-link" onClick={() => submitPassword()} disabled={busy}>
            Kodu yeniden gönder
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Giriş">
      <form className="form" onSubmit={submitPassword}>
        <ErrorAlert error={error} />
        <Field label="E-posta" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Şifre" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kontrol ediliyor…' : 'Devam'}
        </button>
      </form>
      <div className="auth-links">
        <Link href="/sifremi-unuttum">Şifremi unuttum</Link>
        <Link href="/kayit">Hesap oluştur</Link>
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Davet e-postası mı aldınız? <Link href="/sifre-belirle">Şifrenizi belirleyin</Link>.
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
