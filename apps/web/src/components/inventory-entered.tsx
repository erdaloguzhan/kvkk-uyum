'use client';

import { inventoryNameKey } from '@kvkk/shared';
import Link from 'next/link';
import type { InventoryEntry } from '@/lib/types';
import { Badge } from './ui';

const byTurkish = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

/**
 * Envanter girerken yanda görünen özet (Erdal, 17.11.2026): girilmiş satırlar Departman → Faaliyet → Veri kategorisi
 * hiyerarşisinde, her kategorinin kişisel verileriyle. Formda yazılan departman/faaliyet vurgulanır ve en üstte görünür.
 */
export function InventoryEntered({
  entries,
  department,
  activity,
  currentId,
}: {
  entries: InventoryEntry[];
  department?: string;
  activity?: string;
  /** Düzenlenen satır (listede işaretlenir). */
  currentId?: string;
}) {
  const depKey = inventoryNameKey(department);
  const actKey = inventoryNameKey(activity);

  const departments = new Map<string, { name: string; activities: Map<string, { name: string; rows: InventoryEntry[] }> }>();
  for (const e of entries) {
    const dk = inventoryNameKey(e.department);
    const d = departments.get(dk) ?? { name: e.department, activities: new Map() };
    const ak = inventoryNameKey(e.activity);
    const a = d.activities.get(ak) ?? { name: e.activity, rows: [] };
    a.rows.push(e);
    d.activities.set(ak, a);
    departments.set(dk, d);
  }
  const sorted = [...departments.entries()].sort(
    ([ka, a], [kb, b]) => Number(kb === depKey) - Number(ka === depKey) || byTurkish(a.name, b.name),
  );

  return (
    <div className="card inv-entered">
      <h2>Girilmiş satırlar</h2>
      {entries.length === 0 ? (
        <p className="muted small">Henüz envanter satırı yok.</p>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            {entries.length} satır. Bir faaliyette her veri kategorisi bir kez yer alır; yeni kişisel verileri mevcut satıra ekleyin.
          </p>
          {sorted.map(([dk, d]) => (
            <details key={dk} open={dk === depKey || departments.size <= 3}>
              <summary>
                <strong>{d.name}</strong> <span className="muted small">({[...d.activities.values()].reduce((n, a) => n + a.rows.length, 0)})</span>
              </summary>
              {[...d.activities.entries()]
                .sort(([ka, a], [kb, b]) => Number(kb === actKey) - Number(ka === actKey) || byTurkish(a.name, b.name))
                .map(([ak, a]) => {
                  const focused = dk === depKey && ak === actKey;
                  return (
                    <div key={ak} className={`inv-entered-activity${focused ? ' focused' : ''}`}>
                      <div className="small" style={{ fontWeight: 600 }}>
                        {a.name}
                        {focused && <span className="muted"> · formdaki süreç</span>}
                      </div>
                      <ul>
                        {a.rows
                          .sort((x, y) => byTurkish(x.dataCategory, y.dataCategory))
                          .map((r) => {
                            const data = [r.personalData, r.specialCategoryData].filter(Boolean).join(' / ');
                            return (
                              <li key={r.id} className="small">
                                {r.id === currentId ? (
                                  <strong>{r.dataCategory} (bu satır)</strong>
                                ) : (
                                  <Link href={`/envanter/${r.id}`}>{r.dataCategory}</Link>
                                )}{' '}
                                {r.complete ? <Badge kind="success">Tamam</Badge> : <Badge kind="warning">{r.missingFields.length} eksik</Badge>}
                                {data && <div className="muted">{data}</div>}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  );
                })}
            </details>
          ))}
        </>
      )}
    </div>
  );
}
