'use client';

import type { InventoryColumnDefinition } from '@kvkk/shared';
import { FormEvent, useState } from 'react';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import type { InventoryTemplateOption } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/**
 * Kişisel Veri Envanteri (şablon): envanter sütunlarındaki seçenekler (Erdal, 28.10.2026). Kuruluşlar envanter
 * satırı girerken bu seçenekleri görür; değişiklik sonraki girişlerde geçerlidir, mevcut satırlar değişmez.
 */
export default function InventoryTemplatePage() {
  const data = useApi<{ columns: InventoryColumnDefinition[]; items: InventoryTemplateOption[] }>('admin/inventory-template');
  const [field, setField] = useState('dataCategory');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (data.loading && !data.data) return <Loading />;
  const columns = data.data?.columns ?? [];
  const all = data.data?.items ?? [];
  const options = all.filter((o) => o.field === field).sort((a, b) => a.sortOrder - b.sortOrder);
  const column = columns.find((c) => c.field === field);
  const isCategory = field === 'dataCategory';

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await data.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const move = (index: number, by: number) => {
    const ids = options.map((o) => o.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    run(() => api('admin/inventory-template/order', { method: 'PUT', body: { field, ids } }));
  };

  return (
    <>
      <PageHeader
        title="Kişisel Veri Envanteri (şablon)"
        description="Kuruluşlar envanter satırı girerken her sütunda bu seçenekleri görür. Değişiklik sonradan girilen satırlarda geçerli olur; mevcut envanter satırlarındaki değerler değişmez."
      />
      <div className="card">
        <Field label="Sütun" htmlFor="tpl-field">
          <select id="tpl-field" value={field} onChange={(e) => (setField(e.target.value), setEditing(null))}>
            {columns.map((c) => (
              <option key={c.field} value={c.field}>
                {c.label} ({all.filter((o) => o.field === c.field).length})
              </option>
            ))}
          </select>
        </Field>
        {column && (
          <p className="small muted" style={{ margin: 0 }}>
            {column.group} · {column.kind === 'list' ? 'Birden çok seçenek seçilebilir.' : 'Bir seçenek seçilir veya yazılır.'}
          </p>
        )}
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        {options.length === 0 ? (
          <Empty title="Bu sütunda seçenek yok">Kuruluşlar bu sütunu serbest metinle doldurur.</Empty>
        ) : (
          <ol className="list" style={{ paddingLeft: 0, listStyle: 'none' }}>
            {options.map((o, i) =>
              editing === o.id ? (
                <li key={o.id}>
                  <OptionForm
                    initial={o}
                    isCategory={isCategory}
                    submitLabel="Kaydet"
                    onCancel={() => setEditing(null)}
                    onSubmit={(body) => run(() => api(`admin/inventory-template/${o.id}`, { method: 'PATCH', body })).then(() => setEditing(null))}
                  />
                </li>
              ) : (
                <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <span className="muted small">{i + 1}. </span>
                    {o.value} {o.special && <Badge kind="warning">Özel nitelikli</Badge>}
                    {o.examples && <div className="small muted">Örnekler: {o.examples}</div>}
                  </div>
                  <div className="actions nowrap">
                    <button className="btn btn-small" aria-label="Yukarı taşı" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button className="btn btn-small" aria-label="Aşağı taşı" disabled={i === options.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button className="btn btn-small" onClick={() => setEditing(o.id)}>
                      Düzenle
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        if (confirm(`"${o.value}" seçeneği silinsin mi? Bu seçeneği kullanan mevcut envanter satırları değişmez.`)) {
                          run(() => api(`admin/inventory-template/${o.id}`, { method: 'DELETE' }));
                        }
                      }}
                    >
                      Sil
                    </button>
                  </div>
                </li>
              ),
            )}
          </ol>
        )}
      </div>
      <div className="card">
        <h2>Yeni seçenek</h2>
        <OptionForm
          key={field}
          isCategory={isCategory}
          submitLabel="Ekle"
          onSubmit={(body) => run(() => api('admin/inventory-template', { method: 'POST', body: { field, ...body } }))}
        />
      </div>
      <Alert kind="info">Seçenek adını değiştirmek veya silmek, o seçeneği daha önce kullanmış envanter satırlarını değiştirmez.</Alert>
    </>
  );
}

interface OptionBody {
  value: string;
  examples?: string | null;
  special?: boolean;
}

function OptionForm({
  initial,
  isCategory,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: InventoryTemplateOption;
  isCategory: boolean;
  submitLabel: string;
  onSubmit: (body: OptionBody) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial?.value ?? '');
  const [examples, setExamples] = useState(initial?.examples ?? '');
  const [special, setSpecial] = useState(initial?.special ?? false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(isCategory ? { value, examples: examples || null, special } : { value });
      if (!initial) {
        setValue('');
        setExamples('');
        setSpecial(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Seçenek" htmlFor={`opt-${initial?.id ?? 'new'}`} required>
        <input id={`opt-${initial?.id ?? 'new'}`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} required />
      </Field>
      {isCategory && (
        <>
          <Field label="Örnekler" htmlFor={`ex-${initial?.id ?? 'new'}`} hint="Veri kategorisi seçilirken gösterilir.">
            <input id={`ex-${initial?.id ?? 'new'}`} value={examples} onChange={(e) => setExamples(e.target.value)} maxLength={1000} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} /> Özel nitelikli kişisel veri
          </label>
        </>
      )}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !value.trim()}>
          {busy ? 'Kaydediliyor…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Vazgeç
          </button>
        )}
      </div>
    </form>
  );
}
