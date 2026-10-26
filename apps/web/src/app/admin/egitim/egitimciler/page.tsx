'use client';

import { FormEvent, useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { emptyPerson, PersonFields, PersonForm, toPersonForm } from '@/components/person-fields';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDay } from '@/lib/labels';
import type { Trainer } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitimci kayıt ekranı (yalnızca platform yöneticisi). */
export default function TrainersPage() {
  const list = useApi<{ items: Trainer[] }>('training-admin/trainers');
  const [editing, setEditing] = useState<Trainer | 'new' | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyPerson);
  const [isActive, setIsActive] = useState(true);
  const [title, setTitle] = useState('');
  const [signature, setSignature] = useState<File | null>(null);
  const [removeSignature, setRemoveSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (list.loading && !list.data) return <Loading />;
  const items = list.data?.items ?? [];

  function open(t: Trainer | 'new') {
    setEditing(t);
    setForm(t === 'new' ? emptyPerson : toPersonForm(t));
    setIsActive(t === 'new' ? true : t.isActive);
    setTitle(t === 'new' ? '' : (t.title ?? ''));
    setSignature(null);
    setRemoveSignature(false);
    setFormError(null);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setFormError(null);
    const { email, ...rest } = form;
    const profile = {
      ...rest,
      hireDate: rest.hireDate || null,
      terminationDate: rest.terminationDate || null,
      phone: rest.phone || null,
      title: title.trim() || null,
    };
    try {
      let id: string;
      if (editing === 'new') {
        id = (await api<Trainer>('training-admin/trainers', { method: 'POST', body: { ...profile, email } })).id;
        setMessage(`Eğitimci eklendi. ${email} adresine giriş bilgisi gönderildi.`);
      } else if (editing) {
        id = editing.id;
        await api(`training-admin/trainers/${id}`, { method: 'PATCH', body: { ...profile, email, isActive } });
      } else return;
      if (signature) {
        const fd = new FormData();
        fd.append('file', signature);
        await api(`training-admin/trainers/${id}/signature`, { method: 'PUT', body: fd });
      } else if (removeSignature) {
        await api(`training-admin/trainers/${id}/signature`, { method: 'DELETE' });
      }
      setEditing(null);
      await list.reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Trainer) {
    if (!confirm(`${t.firstName} ${t.lastName} eğitimci kaydı silinsin mi? Eğitimlerdeki eğitimci alanı boşalır.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api(`training-admin/trainers/${t.id}`, { method: 'DELETE' });
      setMessage(`${t.firstName} ${t.lastName} silindi.`);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function resend(t: Trainer) {
    if (!confirm(`${t.email} adresine yeni bir şifre oluşturma bağlantısı gönderilsin mi?`)) return;
    setError(null);
    try {
      await api(`training-admin/trainers/${t.id}/resend-invite`, { method: 'POST' });
      setMessage(`Şifre oluşturma bağlantısı ${t.email} adresine gönderildi.`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Eğitimciler"
        description="Eğitimciler yönetim paneline kendi e-postalarıyla girer ve yalnızca eğitim bölümünü görür: eğitim içerikleri, sorular, gruplar ve sınav sonuçları."
        actions={
          <>
            <ExportButton
              fileName="Eğitimciler"
              rows={items}
              columns={[
                { label: 'T.C. Kimlik No', value: (t) => t.nationalId },
                { label: 'Adı', value: (t) => t.firstName },
                { label: 'Soyadı', value: (t) => t.lastName },
                { label: 'İşe Giriş Tarihi', value: (t) => (t.hireDate ? formatDay(t.hireDate) : null) },
                { label: 'İşten Çıkış Tarihi', value: (t) => (t.terminationDate ? formatDay(t.terminationDate) : null) },
                { label: 'Cep Telefonu', value: (t) => t.phone },
                { label: 'E-posta', value: (t) => t.email },
                { label: 'Ünvan', value: (t) => t.title },
                { label: 'İmza', value: (t) => (t.hasSignature ? 'Var' : 'Yok') },
                { label: 'Durum', value: (t) => (t.isActive ? 'Aktif' : 'Pasif') },
              ]}
            />
            <button className="btn btn-primary" onClick={() => open('new')}>
              + Eğitimci ekle
            </button>
          </>
        }
      />
      <ErrorAlert error={list.error ?? error} />
      {message && <Alert kind="success">{message}</Alert>}
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <Empty title="Henüz eğitimci yok" />
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>T.C. Kimlik No</th>
                  <th>Adı Soyadı</th>
                  <th>Ünvan</th>
                  <th>İmza</th>
                  <th>İşe giriş</th>
                  <th>İşten çıkış</th>
                  <th>Cep telefonu</th>
                  <th>E-posta</th>
                  <th>Durum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{t.nationalId}</td>
                    <td>
                      {t.firstName} {t.lastName}
                    </td>
                    <td>{t.title ?? '—'}</td>
                    <td>{t.hasSignature ? <Badge kind="success">Var</Badge> : <Badge>Yok</Badge>}</td>
                    <td className="nowrap">{formatDay(t.hireDate)}</td>
                    <td className="nowrap">{formatDay(t.terminationDate)}</td>
                    <td className="nowrap">{t.phone ?? '—'}</td>
                    <td>{t.email}</td>
                    <td>{t.isActive ? <Badge kind="success">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                    <td className="nowrap">
                      <button className="btn btn-small" onClick={() => open(t)}>
                        Düzenle
                      </button>{' '}
                      <button className="btn btn-small" onClick={() => resend(t)}>
                        Şifre bağlantısı gönder
                      </button>{' '}
                      <button className="btn btn-small btn-danger" onClick={() => remove(t)}>
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Yeni eğitimci' : 'Eğitimciyi düzenle'}>
        <form className="form" onSubmit={save}>
          <ErrorAlert error={formError} />
          <PersonFields
            value={form}
            onChange={setForm}
            emailRequired
            phoneHint="Yönetim paneline girişte doğrulama kodu bu numaraya SMS ile gider."
            emailHint={editing === 'new' ? 'Kullanıcı adı olur; şifre oluşturma bağlantısı bu adrese gider.' : 'Kullanıcı adıdır; değiştirirseniz eğitimci yeni adresle giriş yapar.'}
          />
          <Field label="Ünvan" htmlFor="t-unvan" hint="Sertifikada eğitimcinin adının altında yazar.">
            <input id="t-unvan" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="ör. KVKK Danışmanı" />
          </Field>
          <Field
            label="İmza"
            htmlFor="t-imza"
            hint={`Sertifikada eğitimcinin adının üstüne basılır. Beyaz veya şeffaf zeminli PNG ya da JPEG, en fazla 1 MB.${
              removeSignature ? ' Kaydettiğinizde mevcut imza kaldırılacak.' : ''
            }`}
          >
            {editing && editing !== 'new' && editing.hasSignature && !removeSignature && !signature && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/training-admin/trainers/${editing.id}/signature`}
                  alt="Eğitimcinin imzası"
                  style={{ maxWidth: 200, maxHeight: 70, border: '1px solid var(--border)', background: '#fff' }}
                />
                <button type="button" className="btn btn-small btn-danger" onClick={() => setRemoveSignature(true)}>
                  İmzayı kaldır
                </button>
              </div>
            )}
            <input id="t-imza" type="file" accept="image/png,image/jpeg" onChange={(e) => setSignature(e.target.files?.[0] ?? null)} />
          </Field>
          {editing !== 'new' && (
            <label className="checkbox">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Aktif (pasif eğitimci yönetim paneline giremez)
            </label>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
