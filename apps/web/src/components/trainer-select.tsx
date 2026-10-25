'use client';

import type { Trainer } from '@/lib/types';
import { Field } from './ui';

/** Grubun eğitimcisi (yalnızca aktif eğitimciler); sertifikada eğitimci olarak yazar. */
export function TrainerSelect({ trainers, value, onChange }: { trainers?: Trainer[]; value: string; onChange: (id: string) => void }) {
  const active = (trainers ?? []).filter((t) => t.isActive || t.id === value);
  return (
    <Field
      label="Eğitimci"
      required
      htmlFor="g-trainer"
      hint={trainers && active.length === 0 ? 'Aktif eğitimci yok; önce Eğitimciler sayfasından ekleyin.' : 'Sertifikada eğitimci olarak yazar.'}
    >
      <select id="g-trainer" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Seçin</option>
        {active.map((t) => (
          <option key={t.id} value={t.id} disabled={!t.isActive}>
            {t.firstName} {t.lastName}
            {t.isActive ? '' : ' (pasif)'}
          </option>
        ))}
      </select>
    </Field>
  );
}
