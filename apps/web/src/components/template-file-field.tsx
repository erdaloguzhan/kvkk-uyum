'use client';

import { Field } from './ui';

/** Word şablon dosyası seçimi ve kullanılabilir alanların açıklaması. */
export function TemplateFileField({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <Field
      label="Word dosyası (.docx)"
      required
      htmlFor="file"
      hint={
        <>
          Kuruluş bilgileri yerine şu alanları yazın: {'{{kurum.unvan}}'}, {'{{kurum.adresi}}'}, {'{{kurum.vergi_no}}'},{' '}
          {'{{kurum.eposta}}'}, {'{{kurum.telefon}}'}, {'{{kurum.kep}}'}, {'{{kurum.web_sitesi_adresi}}'}, {'{{kurum.yetkili}}'}.
          {file ? ` Seçilen: ${file.name}` : ''}
        </>
      }
    >
      <input
        id="file"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        required
      />
    </Field>
  );
}
