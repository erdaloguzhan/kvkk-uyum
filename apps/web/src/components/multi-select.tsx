'use client';

import { useId, useMemo, useState } from 'react';

const normalize = (s: string) => s.toLocaleLowerCase('tr-TR');

/**
 * Önerilen seçeneklerden birden çoğunu seçmeye ve listede olmayan bir değer eklemeye yarar.
 * Seçilenler üstte etiket olarak görünür.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Listede ara…',
  describe,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder?: string;
  describe?: (option: string) => string | undefined;
}) {
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState('');
  const id = useId();
  const all = useMemo(() => [...options, ...value.filter((v) => !options.includes(v))], [options, value]);
  const shown = search ? all.filter((o) => normalize(o).includes(normalize(search))) : all;

  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  const addCustom = () => {
    const v = custom.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setCustom('');
  };

  return (
    <div className="multi">
      <div className="multi-chips">
        {value.length === 0 && <span className="muted small">Henüz seçim yok</span>}
        {value.map((v) => (
          <span className="chip" key={v}>
            {v}
            <button type="button" aria-label={`${v} kaldır`} onClick={() => toggle(v)}>
              ×
            </button>
          </span>
        ))}
      </div>
      {all.length > 8 && (
        <input
          type="search"
          className="multi-search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="multi-options">
        {shown.length === 0 && <span className="muted small">Eşleşen seçenek yok</span>}
        {shown.map((o, i) => {
          const hint = describe?.(o);
          return (
            <label className="checkbox" key={o} htmlFor={`${id}-${i}`}>
              <input id={`${id}-${i}`} type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
              <span>
                {o}
                {hint && <span className="muted small"> ({hint})</span>}
              </span>
            </label>
          );
        })}
      </div>
      <div className="multi-add">
        <input
          type="text"
          placeholder="Listede yoksa yazıp ekleyin"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="btn" onClick={addCustom} disabled={!custom.trim()}>
          Ekle
        </button>
      </div>
    </div>
  );
}
