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
}

const EMPTY: Person = { email: '', fullName: '' };

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
    </div>
  );
}

export default function NewOrganizationPage() {
  const [created, setCreated] = useState<Created | null>(null);
  const [sameApprover, setSameApprover] = useState(true);
  const [approver, setApprover] = useState<Person>(EMPTY);
  const [viewer, setViewer] = useState<Person>(EMPTY);

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
              setViewer(EMPTY);
              setSameApprover(true);
            }}
          >
            Başka kuruluş ekle
          </button>
        </div>
      </>
    );
  }

  const hasViewer = viewer.email.trim() !== '' || viewer.fullName.trim() !== '';

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
              approver: sameApprover ? { email: profile.email, fullName: profile.authorizedPerson } : approver,
              viewer: hasViewer ? viewer : null,
            };
            setCreated(await api<Created>('admin/organizations', { method: 'POST', body }));
          }}
        >
          <h3>Yönetici (dokümanları onaylayan)</h3>
          <label className="checkbox">
            <input type="checkbox" checked={sameApprover} onChange={(e) => setSameApprover(e.target.checked)} /> Yönetici, KVKK
            Sorumlusu ile aynı kişi (tek hesap hem hazırlar hem onaylar)
          </label>
          {!sameApprover && <PersonInputs id="approver" value={approver} onChange={setApprover} required />}
          <h3>İzleyici (isteğe bağlı)</h3>
          <p className="hint">Yalnızca onaylanıp yayınlanmış dokümanları görür. Boş bırakılabilir, sonradan da eklenebilir.</p>
          <PersonInputs id="viewer" value={viewer} onChange={setViewer} required={hasViewer} />
        </OrgForm>
      </div>
    </>
  );
}
