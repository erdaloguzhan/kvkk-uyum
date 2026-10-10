'use client';

import Link from 'next/link';
import { useState } from 'react';
import { OrgForm } from '@/components/org-form';
import { Alert, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Created {
  organization: { id: string; name: string };
  owner: { email: string; newUser: boolean };
}

export default function NewOrganizationPage() {
  const [created, setCreated] = useState<Created | null>(null);

  if (created) {
    return (
      <>
        <PageHeader title="Kuruluş eklendi" />
        <Alert kind="success">
          <strong>{created.organization.name}</strong> eklendi.{' '}
          {created.owner.newUser
            ? `${created.owner.email} adresine şifre oluşturma bağlantısı gönderildi. Yetkili bağlantıya tıklayıp şifresini oluşturduktan sonra giriş yapabilir.`
            : `${created.owner.email} adresiyle zaten bir hesap vardı; kuruluş bu hesaba yönetici olarak bağlandı ve kişi e-postayla bilgilendirildi.`}
        </Alert>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-primary" href="/admin">
            Kuruluşlara dön
          </Link>
          <button className="btn" onClick={() => setCreated(null)}>
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
        description="Bu bilgiler kuruluşun KVKK dokümanlarına otomatik olarak yerleşir. Kuruluş yetkilisi sonradan değiştirebilir."
      />
      <div className="card">
        <OrgForm
          inviteMode
          submitLabel="Kuruluşu ekle ve davet gönder"
          onSubmit={async (profile) => {
            setCreated(await api<Created>('admin/organizations', { method: 'POST', body: profile }));
          }}
        />
      </div>
    </>
  );
}
