'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ErrorAlert, Field } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== password2 ? 'Şifreler aynı değil' : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api('auth/register', { method: 'POST', body: { fullName, email, password }, auth: false });
      router.push(`/giris?eposta=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Hesap oluştur" subtitle="Hesabınızı oluşturduktan sonra giriş yapıp kuruluşunuzu ekleyeceksiniz.">
      <form className="form" onSubmit={submit}>
        <ErrorAlert error={error} />
        <Field label="Ad soyad" htmlFor="fullName">
          <input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="E-posta" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Şifre" htmlFor="password" hint={PASSWORD_HINT}>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Şifre (tekrar)" htmlFor="password2">
          <input id="password2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Hesap oluştur'}
        </button>
      </form>
      <div className="auth-links">
        <Link href="/giris">Zaten hesabım var</Link>
      </div>
    </AuthCard>
  );
}
