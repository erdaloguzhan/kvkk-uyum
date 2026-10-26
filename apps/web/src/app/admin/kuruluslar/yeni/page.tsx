'use client';

import Link from 'next/link';
import { useState } from 'react';
import { OrgForm } from '@/components/org-form';
import { Alert, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';

interface Created {
  organization: { id: string; name: string };
  members: { email: string; role: string; newUser: boolean }[];
}

interface Person {
  email: string;
  fullName: string;
  phone: string;
}

const EMPTY: Person = { email: '', fullName: '', phone: '' };
const PHONE_HINT = 'Giriş doğrulama kodu bu numaraya SMS ile gider.';

function PersonInputs({ id, value, onChange, required }: { id: string; value: Person; onChange: (p: Person) => void; required?: boolean }) {
  return (
    <div className="form-row">
      <Field label="Ad soyad" htmlFor={`${id}-name`} required={required}>
        <input
          id={`${id}-name`}
          value={value.fullName}
          onChange={(e) => onChange({ ...value, fullName: e.target.value })}
          required={required}
          minLength={2}
        />
      </Field>
      <Field label="E-posta" htmlFor={`${id}-email`} required={required} hint="Kullanıcı adı olur; şifre oluşturma bağlantısı bu adrese gider.">
        <input id={`${id}-email`} type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} required={required} />
      </Field>
      <Field label="Cep telefonu" htmlFor={`${id}-phone`} required={required} hint={PHONE_HINT}>
        <input
          id={`${id}-phone`}
          type="tel"
          placeholder="05XX XXX XX XX"
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          required={required}
        />
      </Field>
    </div>
  );
}

export default function NewOrganizationPage() {
  const [created, setCreated] = useState<Created | null>(null);
  const [sameApprover, setSameApprover] = useState(true);
  const [approver, setApprover] = useState<Person>(EMPTY);
  const [officerPhone, setOfficerPhone] = useState('');

  if (created) {
    return (
      <>
        <PageHeader title="Kuruluş eklendi" />
        <Alert kind="success">
          <p>
            <strong>{created.organization.name}</strong> eklendi. Kullanıcılar:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {created.members.map((m) => (
              <li key={m.email}>
                {ROLE_LABELS[m.role] ?? m.role}: {m.email} —{' '}
                {m.newUser
                  ? 'şifre oluşturma bağlantısı gönderildi.'
                  : 'bu adresle zaten bir hesap vardı; hesap kuruluşa bağlandı ve kişi bilgilendirildi.'}
              </li>
            ))}
          </ul>
        </Alert>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" href={`/admin/kuruluslar/${created.organization.id}`}>
            Kuruluş sayfasına git
          </Link>
          <Link className="btn" href="/admin">
            Kuruluşlara dön
          </Link>
          <button
            className="btn"
            onClick={() => {
              setCreated(null);
              setApprover(EMPTY);
              setOfficerPhone('');
              setSameApprover(true);
            }}
          >
            Başka kuruluş ekle
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="small">
        <Link href="/admin">← Kuruluşlar</Link>
      </p>
      <PageHeader
        title="Yeni kuruluş"
        description="Bu bilgiler kuruluşun KVKK dokümanlarına otomatik olarak yerleşir. Kuruluşun kullanıcıları burada belirlenir; müşteri kendisi kullanıcı ekleyemez."
      />
      <div className="card">
        <OrgForm
          inviteMode
          submitLabel="Kuruluşu ekle ve davetleri gönder"
          onSubmit={async (profile) => {
            const body = {
              ...profile,
              authorizedPhone: officerPhone,
              approver: sameApprover ? { email: profile.email, fullName: profile.authorizedPerson, phone: officerPhone } : approver,
            };
            setCreated(await api<Created>('admin/organizations', { method: 'POST', body }));
          }}
        >
          <Field label="KVKK Sorumlusunun cep telefonu" htmlFor="officer-phone" required hint={PHONE_HINT}>
            <input id="officer-phone" type="tel" placeholder="05XX XXX XX XX" value={officerPhone} onChange={(e) => setOfficerPhone(e.target.value)} required />
          </Field>
          <h3>Yönetici (dokümanları onaylayan)</h3>
          <label className="checkbox">
            <input type="checkbox" checked={sameApprover} onChange={(e) => setSameApprover(e.target.checked)} /> Yönetici, KVKK
            Sorumlusu ile aynı kişi (tek hesap hem hazırlar hem onaylar)
          </label>
          {!sameApprover && <PersonInputs id="approver" value={approver} onChange={setApprover} required />}
          <p className="hint">
            Çalışanlar yayınlanmış dokümanları ayrı hesap açılmadan Eğitim Portalında görür; kuruluş sayfasındaki çalışan
            listesinden portal erişimi gönderilir.
          </p>
        </OrgForm>
      </div>
    </>
  );
}
