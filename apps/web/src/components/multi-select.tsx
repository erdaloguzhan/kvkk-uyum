'use client';

import { useId, useMemo, useState } from 'react';

const normalize = (s: string) => s.toLocaleLowerCase('tr-TR');

/**
 * Önerilen seçeneklerden birden çoğunu seçmeye ve listede olmayan bir değer eklemeye yarar.
 * Seçilenler üstte etiket olarak görünür. Listenin sonundaki "Diğer" işaretlenince listede olmayan değer yazılır.
 * `exclusive` verilirse o seçenek tek başına seçilir (ör. "hiç birine veri aktarılmamaktadır"): o seçilince diğerleri,
 * diğerlerinden biri seçilince o kaldırılır.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Listede ara…',
  describe,
  exclusive,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder?: string;
  describe?: (option: string) => string | undefined;
  exclusive?: string;
}) {
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState('');
  const id = useId();
  const listed = useMemo(() => (exclusive ? [exclusive, ...options.filter((o) => o !== exclusive)] : options), [options, exclusive]);
  const all = useMemo(() => [...listed, ...value.filter((v) => !listed.includes(v))], [listed, value]);
  const shown = search ? all.filter((o) => normalize(o).includes(normalize(search))) : all;
  const hasCustom = value.some((v) => !listed.includes(v));
  const [otherOpen, setOtherOpen] = useState(hasCustom);
  const showOther = otherOpen || hasCustom;

  const select = (next: string[], added?: string) => {
    if (exclusive && added) next = added === exclusive ? [exclusive] : next.filter((v) => v !== exclusive);
    onChange(next);
  };
  const toggle = (o: string) => (value.includes(o) ? onChange(value.filter((v) => v !== o)) : select([...value, o], o));
  const addCustom = () => {
    const v = custom.trim();
    if (v && !value.includes(v)) select([...value, v], v);
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
      <div className="multi-other">
      <label className="checkbox" htmlFor={`${id}-other`}>
        <input
          id={`${id}-other`}
          type="checkbox"
          checked={showOther}
          disabled={hasCustom}
          onChange={() => setOtherOpen((o) => !o)}
        />
        <span>Diğer</span>
      </label>
      </div>
      {showOther && (
      <div className="multi-add">
        <input
          type="text"
          autoFocus={otherOpen && !hasCustom}
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
      )}
    </div>
  );
}
