'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Alert, ErrorAlert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { solveCaptcha } from '@/lib/captcha';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';

/**
 * Şifre sıfırlama isteği. E-postaya sıfırlama bağlantısı gider; hesapta cep telefonu kayıtlıysa ayrıca SMS ile
 * 6 haneli kod gelir ve şifre bu sayfada kodla yenilenebilir. Yanıt her durumda aynıdır; adresin veya telefonun
 * kayıtlı olup olmadığı anlaşılamaz.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ challengeId: string }>('auth/password-reset/request', {
        method: 'POST',
        body: { email, captchaToken: await solveCaptcha() },
        auth: false,
      });
      setChallengeId(res.challengeId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== password2 ? 'Şifreler aynı değil' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api('auth/password-reset/confirm-code', {
        method: 'POST',
        body: { challengeId, code: code.trim(), password },
        auth: false,
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Şifremi unuttum" subtitle={challengeId ? undefined : 'Şifrenizi yenilemek için size bir kod gönderelim.'}>
      {done ? (
        <>
          <Alert kind="success">Şifreniz kaydedildi. Artık giriş yapabilirsiniz.</Alert>
          <Link className="btn btn-primary" href="/giris">
            Giriş yap
          </Link>
        </>
      ) : challengeId ? (
        <form className="form" onSubmit={confirm}>
          <Alert kind="success">
            Bu adresle kayıtlı bir hesap varsa cep telefonunuza SMS ile 6 haneli bir kod, e-posta adresinize de sıfırlama bağlantısı
            gönderildi. SMS kodu 10 dakika geçerlidir.
          </Alert>
          <ErrorAlert error={error} />
          <Field label="SMS ile gelen kod" htmlFor="code">
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
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
          <p className="small muted">
            SMS gelmediyse e-postadaki bağlantıyı açın (gelen kutunuzda yoksa Gereksiz/Spam klasörüne bakın) veya e-postadaki kodu{' '}
            <Link href="/sifre-belirle">buraya girin</Link>.
          </p>
        </form>
      ) : (
        <form className="form" onSubmit={request}>
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
