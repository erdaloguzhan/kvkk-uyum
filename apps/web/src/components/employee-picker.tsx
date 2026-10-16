'use client';

import { useState } from 'react';
import type { PickableEmployee } from '@/lib/types';
import { Badge } from './ui';

/** Kuruluş çalışanlarından katılımcı seçimi (arama + tümünü seç). */
export function EmployeePicker({
  employees,
  selected,
  onChange,
  exclude = [],
}: {
  employees: PickableEmployee[];
  selected: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState('');
  const [hideLeft, setHideLeft] = useState(true);
  const visible = employees.filter(
    (e) =>
      !exclude.includes(e.id) &&
      (!hideLeft || !e.terminationDate) &&
      `${e.firstName} ${e.lastName} ${e.nationalId}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')),
  );
  const allSelected = visible.length > 0 && visible.every((e) => selected.includes(e.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleAll = () =>
    onChange(allSelected ? selected.filter((id) => !visible.some((e) => e.id === id)) : [...new Set([...selected, ...visible.map((e) => e.id)])]);

  return (
    <div className="field">
      <div className="toolbar" style={{ marginBottom: 6 }}>
        <input type="search" placeholder="Ad veya T.C. no ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkbox">
          <input type="checkbox" checked={hideLeft} onChange={(e) => setHideLeft(e.target.checked)} />
          İşten ayrılanları gizle
        </label>
      </div>
      <div className="pick-list">
        {visible.length === 0 ? (
          <div className="muted small">Seçilebilecek çalışan yok.</div>
        ) : (
          <>
            <label className="checkbox" style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Tümünü seç ({visible.length})
            </label>
            {visible.map((e) => (
              <label key={e.id} className="checkbox">
                <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                <span>
                  {e.firstName} {e.lastName} <span className="muted small">· {e.nationalId}</span>{' '}
                  {!e.email && <Badge kind="warning">E-posta yok</Badge>}
                </span>
              </label>
            ))}
          </>
        )}
      </div>
      <span className="hint">{selected.length} çalışan seçildi. E-postası olmayan çalışana eğitim gönderilemez.</span>
    </div>
  );
}
