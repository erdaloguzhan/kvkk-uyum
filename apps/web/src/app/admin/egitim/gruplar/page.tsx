'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { EmployeePicker } from '@/components/employee-picker';
import { TrainerSelect } from '@/components/trainer-select';
import { ExportButton } from '@/components/export-button';
import { Badge, Empty, ErrorAlert, Field, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import type { PickableEmployee, Trainer, TrainingGroup, TrainingSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitim grupları: kuruluş seçilip çalışanlardan katılımcılar seçilerek oluşturulur. */
export default function GroupsPage() {
  const list = useApi<{ items: TrainingGroup[] }>('training-admin/groups');
  const [creating, setCreating] = useState(false);

  if (list.loading && !list.data) return <Loading />;
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Eğitim grupları"
        description="Bir kuruluşun seçilen çalışanlarına bir eğitim atayın. Eğitim başlatılınca katılımcılara eğitim bağlantısı SMS ile gider; portala cep telefonu ve SMS koduyla girerler."
        actions={
          <>
            <Link className="btn btn-small" href="/admin/egitim/sonuclar">
              Sınav sonuçları
            </Link>
            <ExportButton
              fileName="Eğitim grupları"
              rows={items}
              columns={[
                { label: 'Grup adı', value: (g) => g.name },
                { label: 'Kuruluş', value: (g) => g.organizationName },
                { label: 'Eğitim', value: (g) => g.trainingName },
                { label: 'Eğitimci', value: (g) => g.trainerName },
                { label: 'Katılımcı', value: (g) => g.participantCount },
                { label: 'Gönderilen', value: (g) => g.sentCount },
                { label: 'Tamamlayan', value: (g) => g.completedCount },
                { label: 'Eğitim atama tarihi', value: (g) => (g.assignedAt ? formatDate(g.assignedAt) : null) },
              ]}
            />
            {!creating && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                + Yeni grup
              </button>
            )}
          </>
        }
      />
      <ErrorAlert error={list.error} />
      {creating && <NewGroup onCancel={() => setCreating(false)} />}
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <Empty title="Henüz eğitim grubu yok" />
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Grup</th>
                  <th>Kuruluş</th>
                  <th>Eğitim</th>
                  <th>Eğitimci</th>
                  <th>Katılımcı</th>
                  <th>Tamamlayan</th>
                  <th>Eğitim atama tarihi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link href={`/admin/egitim/gruplar/${g.id}`}>{g.name}</Link>
                    </td>
                    <td>{g.organizationName}</td>
                    <td>{g.trainingName}</td>
                    <td>{g.trainerName ?? <Badge kind="warning">Seçilmedi</Badge>}</td>
                    <td>
                      {g.participantCount}
                      {g.sentCount < g.participantCount && (
                        <div>
                          <Badge kind="warning">{g.participantCount - g.sentCount} gönderilmedi</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      {g.completedCount} / {g.participantCount}
                    </td>
                    <td className="nowrap">{g.assignedAt ? formatDate(g.assignedAt) : <Badge>Başlatılmadı</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function NewGroup({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const orgs = useApi<{ items: { id: string; name: string }[] }>('training-admin/organizations');
  const trainings = useApi<{ items: TrainingSummary[] }>('training-admin/trainings');
  const trainers = useApi<{ items: Trainer[] }>('training-admin/trainers');
  const [trainerId, setTrainerId] = useState('');
  const [orgId, setOrgId] = useState('');
  const employees = useApi<{ items: PickableEmployee[] }>(orgId ? `training-admin/organizations/${orgId}/employees` : null);
  const [trainingId, setTrainingId] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Taslak eğitimler de listelenir ama seçilemez; yalnızca yayındaki eğitim gruba atanabilir.
  const all = trainings.data?.items ?? [];
  const active = all.filter((t) => t.status === 'active');
  const trainingHint =
    trainings.loading && !trainings.data
      ? 'Eğitimler yükleniyor…'
      : all.length === 0
        ? 'Henüz eğitim yok; önce Eğitimler sayfasından bir eğitim oluşturup yayına alın.'
        : active.length === 0
          ? 'Yayında eğitim yok; taslak eğitimi gruba atamak için önce eğitim sayfasından yayına alın.'
          : active.length < all.length
            ? 'Taslak eğitimler gruba atanamaz; önce yayına alınmalı.'
            : undefined;

  useEffect(() => {
    setSelected([]);
    const org = orgs.data?.items.find((o) => o.id === orgId);
    if (org) setName(`${org.name} çalışanları eğitimi`);
  }, [orgId, orgs.data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>('training-admin/groups', {
        method: 'POST',
        body: { organizationId: orgId, trainingId, trainerId, name, employeeIds: selected },
      });
      router.push(`/admin/egitim/gruplar/${g.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Yeni eğitim grubu</h2>
      <ErrorAlert error={error ?? orgs.error ?? trainings.error ?? trainers.error ?? employees.error} />
      <div className="form-row">
        <Field label="Kuruluş" required htmlFor="g-org">
          <select id="g-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
            <option value="">Seçin</option>
            {orgs.data?.items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Eğitim" required htmlFor="g-training" hint={trainingHint}>
          <select id="g-training" value={trainingId} onChange={(e) => setTrainingId(e.target.value)} required>
            <option value="">Seçin</option>
            {all.map((t) => (
              <option key={t.id} value={t.id} disabled={t.status !== 'active'}>
                {t.status === 'active' ? t.name : `${t.name} (taslak)`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Grup adı" required htmlFor="g-name" hint='Örnek: "X firması çalışanları eğitimi"'>
          <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <TrainerSelect trainers={trainers.data?.items} value={trainerId} onChange={setTrainerId} />
      </div>
      {orgId &&
        (employees.loading && !employees.data ? (
          <Loading />
        ) : (
          <>
            <span className="field-label">Katılımcılar</span>
            {employees.data?.items.length === 0 ? (
              <span className="muted">
                Bu kuruluşta kayıtlı çalışan yok. Çalışanları yönetim panelinde kuruluşun sayfasından ekleyin.
              </span>
            ) : (
              <EmployeePicker employees={employees.data?.items ?? []} selected={selected} onChange={setSelected} />
            )}
          </>
        ))}
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Vazgeç
        </button>
        <button className="btn btn-primary" disabled={busy || !orgId || !trainingId || !trainerId}>
          {busy ? 'Oluşturuluyor…' : 'Grubu oluştur'}
        </button>
      </div>
    </form>
  );
}
