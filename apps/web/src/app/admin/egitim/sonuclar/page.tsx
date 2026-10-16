'use client';

import { useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { RESULT_EXPORT_COLUMNS, ResultsTable } from '@/components/results-table';
import { ErrorAlert, Loading, PageHeader } from '@/components/ui';
import type { TrainingGroup, TrainingResult, TrainingSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Eğitim sınav sonuçları: katılımcıların notları ve başarılı olanlar için sertifika. */
export default function ResultsPage() {
  const [trainingId, setTrainingId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [onlyPassed, setOnlyPassed] = useState(false);
  const trainings = useApi<{ items: TrainingSummary[] }>('training-admin/trainings');
  const orgs = useApi<{ items: { id: string; name: string }[] }>('training-admin/organizations');
  const groups = useApi<{ items: TrainingGroup[] }>('training-admin/groups', { trainingId, organizationId });
  const results = useApi<{ items: TrainingResult[] }>('training-admin/results', { trainingId, organizationId, groupId });

  const rows = (results.data?.items ?? []).filter((r) => !onlyPassed || r.passed);

  return (
    <>
      <PageHeader
        title="Sınav sonuçları"
        description="Katılımcıların eğitime başlama/bitirme tarihleri ve notları. Eğitim notu son testin notudur; geçme notuna ulaşan katılımcı için sertifika oluşturulabilir."
        actions={<ExportButton fileName="Eğitim sınav sonuçları" rows={rows} columns={RESULT_EXPORT_COLUMNS} />}
      />
      <div className="toolbar">
        <select value={trainingId} onChange={(e) => (setTrainingId(e.target.value), setGroupId(''))} aria-label="Eğitim">
          <option value="">Tüm eğitimler</option>
          {trainings.data?.items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={organizationId} onChange={(e) => (setOrganizationId(e.target.value), setGroupId(''))} aria-label="Kuruluş">
          <option value="">Tüm kuruluşlar</option>
          {orgs.data?.items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Eğitim grubu">
          <option value="">Tüm gruplar</option>
          {groups.data?.items.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyPassed} onChange={(e) => setOnlyPassed(e.target.checked)} />
          Yalnızca başarılı olanlar
        </label>
      </div>
      <ErrorAlert error={results.error} />
      <div className="card" style={{ padding: 0 }}>
        {results.loading && !results.data ? <Loading /> : <ResultsTable rows={rows} />}
      </div>
    </>
  );
}
