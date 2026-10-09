'use client';

import { PERMISSIONS } from '@kvkk/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Empty, ErrorAlert, Loading, PageHeader, Stat } from '@/components/ui';
import { api, download, errorText } from '@/lib/api';
import { fieldLabel } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { InventoryEntry, InventorySummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function InventoryPage() {
  const router = useRouter();
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.INVENTORY_WRITE);
  const [department, setDepartment] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const list = useApi<{ items: InventoryEntry[] }>('inventory', {
    department: department || undefined,
    incomplete: onlyIncomplete ? true : undefined,
  });
  const summary = useApi<InventorySummary>('inventory/summary');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const exportXlsx = () => act('export', () => download('inventory/export', 'TBL-010 Kişisel Veri Envanteri Tablosu.xlsx'));
  const duplicate = (e: InventoryEntry) =>
    act(e.id, async () => {
      const copy = await api<InventoryEntry>(`inventory/${e.id}/duplicate`, { method: 'POST' });
      router.push(`/envanter/${copy.id}`);
    });
  const remove = (e: InventoryEntry) => {
    if (!confirm(`"${e.department} / ${e.activity} / ${e.dataCategory}" satırı silinsin mi?`)) return;
    act(e.id, async () => {
      await api(`inventory/${e.id}`, { method: 'DELETE' });
      await Promise.all([list.reload(), summary.reload()]);
    });
  };

  const s = summary.data;
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Kişisel veri envanteri"
        description="Her satır bir departmanın bir faaliyetinde işlenen bir veri kategorisidir (TBL-010)."
        actions={
          <>
            {canWrite && (
              <Link className="btn btn-primary" href="/envanter/yeni">
                + Yeni satır
              </Link>
            )}
            <button className="btn" onClick={exportXlsx} disabled={busy !== null || !s?.entries}>
              {busy === 'export' ? 'Hazırlanıyor…' : "Excel'e aktar"}
            </button>
            {canWrite && (
              <Link className="btn" href="/envanter/ice-aktar">
                Excel&apos;den içe aktar
              </Link>
            )}
          </>
        }
      />
      <ErrorAlert error={error ?? list.error} />

      {s && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <Stat label="Envanter satırı" value={s.entries} />
          <Stat label="Eksik bilgili satır" value={s.incomplete} tone={s.incomplete ? 'warn' : undefined} />
          <Stat label="Özel nitelikli veri içeren" value={s.specialCategory} />
          <Stat label="Yurt dışına aktarılan" value={s.foreignTransfer} />
        </div>
      )}

      <div className="toolbar">
        <select aria-label="Departman" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">Tüm departmanlar</option>
          {s?.departments.map((d) => (
            <option key={d.department} value={d.department}>
              {d.department} ({d.entries})
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} />
          Yalnızca eksik olanlar
        </label>
      </div>

      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title={s?.entries ? 'Bu filtreye uyan satır yok' : 'Envanter boş'}>
            {!s?.entries && canWrite && (
              <p>
                <Link href="/envanter/yeni">Adım adım yeni satır ekleyin</Link> veya mevcut TBL-010 Excel dosyanızı{' '}
                <Link href="/envanter/ice-aktar">içe aktarın</Link>.
              </p>
            )}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Departman</th>
                <th>Faaliyet</th>
                <th>Veri kategorisi</th>
                <th>Hukuki sebep</th>
                <th>Saklama süresi</th>
                <th>Durum</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>{e.department}</td>
                  <td>
                    <Link href={`/envanter/${e.id}`}>{e.activity}</Link>
                  </td>
                  <td>
                    {e.dataCategory}
                    {e.specialCategoryData && (
                      <div>
                        <Badge kind="info">Özel nitelikli</Badge>
                      </div>
                    )}
                  </td>
                  <td className="small">{e.legalBases.join('; ') || '—'}</td>
                  <td className="small">{e.retentionPeriod ?? '—'}</td>
                  <td>
                    {e.complete ? (
                      <Badge kind="success">Tamam</Badge>
                    ) : (
                      <span title={e.missingFields.map(fieldLabel).join(', ')}>
                        <Badge kind="warning">{e.missingFields.length} eksik</Badge>
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td>
                      <div className="actions" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-small" onClick={() => duplicate(e)} disabled={busy !== null} title="Bu satırı kopyalayarak yeni satır oluştur">
                          Kopyala
                        </button>
                        <button className="btn btn-small btn-danger" onClick={() => remove(e)} disabled={busy !== null}>
                          Sil
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.some((e) => !e.complete) && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Eksik alanları görmek için satırın faaliyet adına tıklayın.
        </p>
      )}
      {!canWrite && <Alert kind="info">Envanteri yalnızca görüntüleme yetkiniz var.</Alert>}
    </>
  );
}
