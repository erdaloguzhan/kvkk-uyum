import {
  INCIDENT_BREACH_EFFECTS,
  INCIDENT_CYBER_SOURCES,
  INCIDENT_LIKELIHOODS,
  INCIDENT_ORG_IMPACTS,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
  INCIDENT_SOURCES,
  INCIDENT_SPECIAL_DATA_CATEGORIES,
  INCIDENT_SUBJECT_EFFECTS,
  INCIDENT_SUBJECT_GROUPS,
  INCIDENT_SUBJECT_NOTICES,
  IncidentForm,
  IncidentNotificationType,
  IncidentSubjectNotice,
} from '@kvkk/shared';
import PizZip from 'pizzip';

/**
 * Olay kaydından doldurulmuş FRM-020 "Kişisel Veri İhlali Bildirimi" Word dosyası üretir (formun 2026-11 güncel
 * hali: A–D bölümleri, 31 numaralı soru, EK-1 rehber). Şablonda alan yeri olmadığı için aynı soru metinleri,
 * seçenekler ve sırayla yeni bir belge yazılır. İşaretli seçenekler ☒, diğerleri ☐ olur. Kullanıcı dosyayı Kurula
 * göndermeden önce Word'de düzenleyebilir.
 */
export interface Frm020Data {
  notificationType: IncidentNotificationType;
  followUpRef: string | null;
  occurredAt: Date | null;
  endedAt: Date | null;
  detectedAt: Date;
  form: IncidentForm;
}

const SECTION_FILL = '02677C';
const CHECKED = '☒';
const UNCHECKED = '☐';

const esc = (s: string) =>
  s
    // XML 1.0'da geçersiz kontrol karakterleri Word'ün dosyayı açmasını engeller.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  /** Yarım punto (20 = 10 pt). */
  size?: number;
  color?: string;
}

function run(text: string, o: RunOptions = {}) {
  const props = [
    o.bold ? '<w:b/>' : '',
    o.italic ? '<w:i/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '',
  ].join('');
  // Satır sonları Word'de satır kesmesi olur.
  const parts = text.split('\n').map((line) => `<w:t xml:space="preserve">${esc(line)}</w:t>`);
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.join('<w:br/>')}</w:r>`;
}

interface ParagraphOptions {
  shade?: string;
  spaceBefore?: number;
  spaceAfter?: number;
  align?: 'center' | 'both';
  indent?: number;
}

function para(runs: string | string[], o: ParagraphOptions = {}) {
  const props = [
    o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : '',
    `<w:spacing w:before="${o.spaceBefore ?? 60}" w:after="${o.spaceAfter ?? 60}"/>`,
    o.indent ? `<w:ind w:left="${o.indent}"/>` : '',
    o.align ? `<w:jc w:val="${o.align}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${props}</w:pPr>${[runs].flat().join('')}</w:p>`;
}

const section = (title: string) =>
  para(run(` ${title}`, { bold: true, color: 'FFFFFF', size: 22 }), { shade: SECTION_FILL, spaceBefore: 240, spaceAfter: 120 });

const question = (text: string, hint?: string) =>
  para([run(text, { bold: true }), ...(hint ? [run(` ${hint}`, { italic: true, size: 16, color: '555555' })] : [])], {
    spaceBefore: 160,
  });

const box = (cell: string) => `<w:p>${run(cell)}</w:p>`;

function cell(content: string, width: number, fill?: string, span = 1) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>` +
    `${content || '<w:p/>'}</w:tc>`
  );
}

function table(rows: string[][], widths: number[], header = false) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
    .join('');
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows
    // Tek hücreli satır tablo genişliğince birleştirilir (ör. "Cevabınızı detaylandırınız" satırı).
    .map((r, i) => {
      const fill = header && i === 0 ? 'E6EEF0' : undefined;
      if (r.length === 1 && widths.length > 1) return `<w:tr>${cell(r[0], widths.reduce((a, b) => a + b, 0), fill, widths.length)}</w:tr>`;
      return `<w:tr>${r.map((c, j) => cell(c, widths[j], fill)).join('')}</w:tr>`;
    })
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
  );
}

const FULL = 9638;

/** Cevap kutusu: tek hücreli çerçeveli tablo. */
const answer = (text: string | null | undefined) => table([[box(text?.trim() || '')]], [FULL]);

const mark = (checked: boolean, label: string) => run(`${checked ? CHECKED : UNCHECKED} ${label}`);

/** Yan yana seçenekler (Evet / Hayır gibi). */
const inline = (options: [boolean, string][]) =>
  para(options.flatMap(([c, l], i) => (i ? [run('     '), mark(c, l)] : [mark(c, l)])), { indent: 200 });

const checkCell = (options: readonly string[], selected: string[]) =>
  options.map((o) => `<w:p>${mark(selected.includes(o), o)}</w:p>`).join('');

const yesNo = (v: boolean | null) =>
  inline([
    [v === true, 'Evet'],
    [v === false, 'Hayır'],
  ]);

const TIME_ZONE = 'Europe/Istanbul';
export function formatDateTime(d: Date | null) {
  if (!d) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Formdaki biçim: GG/AA/YYYY - SS:DD (boşsa yer tutucu kalır). */
function formDateTime(d: Date | string | null) {
  if (!d) return 'GG/AA/YYYY - SS:DD';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('tr-TR', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} - ${parts.hour}:${parts.minute}`;
}

/** YYYY-AA-GG → GG/AA/YYYY. */
const formDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : 'GG/AA/YYYY');

const labelValue = (label: string, value: string | null | undefined, indent = 0) =>
  para([run(`${label} : `, { bold: true }), run(value?.trim() || '')], { spaceBefore: 40, spaceAfter: 40, indent });

const hint = (text: string) => para(run(text, { italic: true, size: 16, color: '555555' }), { spaceBefore: 0 });

let counter = 0;
/** Numaralı soru (formdaki 1–31). */
const numbered = (text: string, h?: string) => {
  counter += 1;
  return question(`${counter}. ${text}`, h);
};

const count = (n: number | null) => (n === null ? '……………………' : n.toLocaleString('tr-TR'));

/** Tablo hücresinde "Cevabınızı ... :" satırı ve cevap. */
const detailCell = (label: string, text: string | null | undefined) =>
  `<w:p>${run(`${label} `, { bold: true })}${run(text?.trim() || '')}</w:p>`;

/** Satır satır tedbir listesi; boşsa formdaki gibi "…" satırları. */
function bullets(text: string | null) {
  const lines = (text ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  return (lines.length ? lines : ['…', '…', '…']).map((l) => `<w:p>${run(`- ${l}`)}</w:p>`).join('');
}

function measuresTable(technical: string | null, administrative: string | null, note: string | null) {
  return table(
    [
      [box('Teknik Tedbirler'), box('İdari Tedbirler')],
      [bullets(technical), bullets(administrative)],
      [detailCell('Açıklama :', note)],
    ],
    [FULL / 2, FULL / 2],
    true,
  );
}

function levelTable(options: Record<string, { label: string; description: string }>, selected: string | null) {
  const rows = [[box('Etkisi'), box('Açıklama')]];
  for (const [key, o] of Object.entries(options)) {
    rows.push([`<w:p>${mark(selected === key, o.label)}</w:p>`, box(o.description)]);
  }
  return table(rows, [2400, FULL - 2400], true);
}

function body(d: Frm020Data) {
  const f = d.form;
  const out: string[] = [];
  counter = 0;
  out.push(para(run('Kişisel Veri İhlali Bildirimi', { bold: true, size: 32, color: SECTION_FILL }), { align: 'center', spaceAfter: 120 }));
  out.push(
    para(run('*Formu doldururken ihlale konu olan herhangi bir kişisel veriyi bu forma dahil etmeyiniz.', { bold: true, italic: true, size: 18 }), {
      spaceAfter: 120,
    }),
  );

  out.push(section('A) HAKKINIZDA'));
  out.push(labelValue(`${++counter}. Veri sorumlusunun unvanı/ismi`, f.controllerName));
  out.push(labelValue(`${++counter}. Veri sorumlusunun adresi`, f.controllerAddress));
  out.push(labelValue(`${++counter}. Veri sorumlusu internet adresi`, f.controllerWebsite));
  out.push(labelValue(`${++counter}. Veri sorumlusu e-posta adresi`, f.controllerEmail));
  out.push(hint('(Aşağıda yer alan 5., 6., 7. maddeler sadece Türkiye’de yerleşik veri sorumluları tarafından doldurulacaktır)'));
  out.push(labelValue(`${++counter}. Vergi Kimlik/T.C. Kimlik No`, f.controllerTaxId));
  out.push(labelValue(`${++counter}. Veri Sorumlusu KEP Adresi`, f.controllerKep));
  out.push(labelValue(`${++counter}. Veri Sorumlusu UETS Adresi`, f.controllerUets));
  out.push(numbered('Veri sorumlusu adına bu bildirimi hazırlayan kişinin:'));
  out.push(
    hint(
      '(Bu bildirim veri sorumlusu adına başka bir gerçek veya tüzel kişi tarafından doldurulması/gönderilmesi durumunda tevsik edici belgeleri (sözleşme, vekâletname vb.) ekleyiniz.)',
    ),
  );
  out.push(labelValue('Adı ve Soyadı', f.preparerName, 200));
  out.push(labelValue('Görevi/Unvanı', f.preparerTitle, 200));
  out.push(labelValue('E-postası', f.preparerEmail, 200));
  out.push(labelValue('Telefonu', f.preparerPhone, 200));
  out.push(labelValue('Adresi', f.preparerAddress, 200));

  out.push(section('B) İHLAL HAKKINDA'));
  counter += 1;
  out.push(
    para(
      [
        run(`${counter}. Bildirim türü : `, { bold: true }),
        mark(d.notificationType === 'initial', 'İlk bildirim'),
        run('     '),
        mark(d.notificationType === 'follow_up', 'Takip bildirimi'),
        run('     '),
        run('Takip No ', { bold: true }),
        run(d.notificationType === 'follow_up' && d.followUpRef?.trim() ? d.followUpRef.trim() : '……………'),
      ],
      { spaceBefore: 160 },
    ),
  );
  out.push(labelValue(`${++counter}. İhlalin başlama tarihi ve saati`, formDateTime(d.occurredAt)));
  out.push(labelValue(`${++counter}. İhlalin sona erme tarihi ve saati`, formDateTime(d.endedAt)));
  out.push(labelValue(`${++counter}. İhlalin tespit tarihi ve saati`, formDateTime(d.detectedAt)));
  const processor = !!(f.processorName || f.processorAddress || f.processorDetectedAt || f.processorNotifiedAt);
  out.push(
    numbered(
      'İhlal veri işleyen tarafından veri sorumlusuna bildirildiyse',
      '(Yazı, e-posta mesajı vb. tevsik edici belgeleri bu bildirimin ekinde gönderiniz.)',
    ),
  );
  out.push(labelValue('Veri işleyenin unvanı/ ismi', f.processorName, 200));
  out.push(labelValue('Veri işleyenin adresi', f.processorAddress, 200));
  out.push(labelValue('Veri işleyenin tespit tarihi ve saati', processor ? formDateTime(f.processorDetectedAt) : formDateTime(null), 200));
  out.push(
    labelValue('Veri işleyenin veri sorumlusuna bildirdiği tarih ve saat', processor ? formDateTime(f.processorNotifiedAt) : formDateTime(null), 200),
  );

  out.push(numbered('İhlalin kaynağı ve nasıl gerçekleştiği hakkında bilgi veriniz.', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(
    table(
      [
        [checkCell(INCIDENT_SOURCES, f.sources), checkCell(INCIDENT_CYBER_SOURCES, f.cyberSources ?? [])],
        [detailCell('Cevabınızı detaylı bir şekilde açıklayınız:', f.description)],
      ],
      [FULL / 2, FULL / 2],
    ),
  );

  out.push(numbered('İhlal etkisini belirtiniz.', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(
    table(
      [
        [`<w:p>${INCIDENT_BREACH_EFFECTS.map((e, i) => (i ? run('     ') : '') + mark((f.breachEffects ?? []).includes(e), e)).join('')}</w:p>`],
        [detailCell('Cevabınızı detaylandırınız :', f.breachEffectDetail)],
      ],
      [FULL],
    ),
  );

  out.push(numbered('İhlalin nasıl tespit edildiği hakkında bilgi veriniz.', '(Varsa tevsik edici belgeleri bu bildirimin ekinde gönderiniz.)'));
  out.push(answer(f.detectionMethod));

  out.push(numbered('İhlalden etkilenen kişisel veri kategorileri', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(
    table(
      [
        [box('Kişisel Veri'), box('Özel Nitelikli Kişisel Veri')],
        [checkCell(INCIDENT_PERSONAL_DATA_CATEGORIES, f.personalCategories), checkCell(INCIDENT_SPECIAL_DATA_CATEGORIES, f.specialCategories)],
        [detailCell('Cevabınızı detaylandırınız :', f.categoryDetail)],
      ],
      [FULL / 2, FULL / 2],
      true,
    ),
  );

  out.push(numbered('İhlalden etkilenen kişi ve kayıt sayısı'));
  out.push(
    table(
      [
        [
          `<w:p>${run('Kişi Sayısı : ', { bold: true })}${run(count(f.estimatedPeople))}${run('          ')}${run('Kişilere ait Kayıt Sayısı : ', { bold: true })}${run(count(f.estimatedRecords))}</w:p>` +
            `<w:p>${run('(Kişi ve/veya Kayıt Sayıları Tahmini ise Kesin sayıların tespit edilememe nedenini açıklayınız.)', { italic: true, size: 16 })}</w:p>`,
        ],
        [box(f.countNote?.trim() || '')],
      ],
      [FULL],
    ),
  );

  out.push(numbered('İhlalden etkilenen ilgili kişi grupları ve etkileri', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(
    table(
      [
        [box('İlgili Kişi Grupları'), box('İlgili Kişiler Üzerindeki Etkileri')],
        [checkCell(INCIDENT_SUBJECT_GROUPS, f.subjectGroups), checkCell(INCIDENT_SUBJECT_EFFECTS, f.subjectEffects)],
        [
          `<w:p>${mark(!!f.subjectGroupOther?.trim(), 'Diğer (Belirtiniz):')}${run(f.subjectGroupOther?.trim() ? ` ${f.subjectGroupOther.trim()}` : '')}</w:p>`,
          `<w:p>${mark(!!f.subjectEffectOther?.trim(), 'Diğer (Belirtiniz):')}${run(f.subjectEffectOther?.trim() ? ` ${f.subjectEffectOther.trim()}` : '')}</w:p>`,
        ],
      ],
      [FULL / 2, FULL / 2],
      true,
    ),
  );

  out.push(section('C) BİLDİRİM'));
  out.push(
    numbered(
      'Kurula bildirimde tespit tarihinden sonra 72 saat geçirilmiş ise geç bildirimin sebebini açıklayınız',
      '(Yalnızca ilk bildirimler için geçerlidir.)',
    ),
  );
  out.push(answer(d.notificationType === 'initial' ? f.delayReason : null));

  out.push(numbered('İlgili kişilere bildirim yapıldı mı?'));
  out.push(
    table(
      [
        [
          (Object.entries(INCIDENT_SUBJECT_NOTICES) as [IncidentSubjectNotice, string][])
            .map(([key, label]) => `<w:p>${mark(f.subjectNotice === key, label)}</w:p>`)
            .join(''),
        ],
        [detailCell('Cevabınızı detaylandırınız :', f.subjectNoticeDetail)],
      ],
      [FULL],
    ),
  );
  out.push(labelValue(`${++counter}. İlgili kişilere yapılan/yapılacak bildirimin tarihi`, formDate(f.subjectNoticeDate)));
  out.push(
    numbered(
      'İlgili kişilere hangi yöntemle bildirim yapıldığı/yapılacağı hakkında detaylı bilgi veriniz.',
      '(Varsa bildirim örneğinin bir nüshasını bu bildirimin ekinde gönderiniz.)',
    ),
  );
  out.push(answer(f.subjectNoticeMethod));
  out.push(
    numbered(
      'İlgili kişilerin veri ihlali ile ilgili bilgi almalarını sağlayacak iletişim yollarını belirtiniz.',
      '(İnternet adresi, çağrı merkezi vb. bilgiler)',
    ),
  );
  out.push(answer(f.subjectContact));
  out.push(
    numbered(
      'Yurtiçinde bulunan diğer organizasyon veya kurumlara ihlal hakkında bilgi verildi mi veya verilecek mi?',
      '(Örn. polis, diğer denetim ya da gözetim kurumları. Diğer kurumlar ile iletişime geçmeniz gerekebilir.)',
    ),
  );
  out.push(yesNo(f.domesticInformed));
  out.push(informedBox(f.domesticInformed ? f.domesticDetail : null));
  out.push(
    numbered(
      'Yurtdışında bulunan diğer veri koruma otoriteleri veya ilgili kurumlara ihlal hakkında bilgi verildi mi veya verilecek mi?',
      '(Örn. polis, diğer denetim ya da gözetim kurumları)',
    ),
  );
  out.push(yesNo(f.foreignInformed));
  out.push(informedBox(f.foreignInformed ? f.foreignDetail : null));

  out.push(section('Ç) OLASI SONUÇLAR'));
  out.push(numbered('İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı'));
  out.push(
    hint(
      '(Gerçekleşen veri ihlalinin düzeyinin belirlenmesinde ilgili kişiler üzerinde ne kadar bir potansiyel etkiye neden olduğunun değerlendirilmesi gerekmektedir. Söz konusu potansiyel etkinin değerlendirilmesinde ise ihlalin niteliği, nedeni, ihlale maruz kalan verinin türü, ihlalin etkisinin azaltılmasında alınan önlemler ile ihlalden etkilenen ilgili kişi kategorileri göz önünde bulundurulmalıdır.)',
    ),
  );
  out.push(levelTable(INCIDENT_LIKELIHOODS, f.likelihood));
  out.push(numbered('İhlalin organizasyonunuza olan etkileri'));
  out.push(levelTable(INCIDENT_ORG_IMPACTS, f.orgImpact));

  out.push(section('D) ÖNLEMLER'));
  out.push(
    numbered(
      'İhlal ile ilgili olan çalışanların son bir yıl içerisinde aldığı eğitimler nelerdir?',
      '(Varsa tevsik edici belgeleri bu bildirimin ekinde gönderiniz.)',
    ),
  );
  out.push(answer(f.staffTrainings));
  out.push(
    numbered(
      'Bu tür ihlalleri engellemek için ihlalin gerçekleşmesinden önce almış olduğunuz teknik ve idari tedbirlerini belirtiniz.',
      '(Varsa tevsik edici belgeleri bu bildirimin ekinde gönderiniz.)',
    ),
  );
  out.push(measuresTable(f.measuresBeforeTechnical, f.measuresBeforeAdministrative, f.measuresBefore));
  out.push(
    numbered(
      'İhlal sonrası almış olduğunuz veya almayı planladığınız teknik ve idari tedbirleri belirtiniz ve bunların tahminen ne zaman tamamlanacağı hakkında bilgi veriniz.',
    ),
  );
  out.push(
    hint(
      '(Problemi çözmek ve olumsuz etkilerinin ortadan kaldırılmasını teminen almış olduğunuz önlemleri belirtiniz; örneğin yanlışlıkla gönderilmiş olan verilerin yok edilmesi, şifrelerin güvenliğinin sağlanması, veri güvenliği eğitimi planlanması vb. tedbirlere ait varsa tevsik edici belgeleri bu bildirimin ekinde gönderiniz.)',
    ),
  );
  out.push(measuresTable(f.measuresAfterTechnical, f.measuresAfterAdministrative, f.measuresAfter));

  out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  out.push(section('EK 1- VERİ İHLAL BİLDİRİM FORM REHBERİ'));
  GUIDE.forEach((text, i) => {
    out.push(para(run(`${i + 1}. ${text}`, { size: 18 }), { align: 'both' }));
    if (i === 2) out.push(answer(KVKK_ADDRESS));
  });
  return out.join('');
}

const informedBox = (detail: string | null) =>
  table(
    [
      [
        `<w:p>${run('Evet seçeneğini işaretlediyseniz açıklayınız:', { bold: true })}</w:p>` +
          `<w:p>${run('(İlgili belgelerin bir nüshasını bu bildirimin ekinde gönderiniz.)', { italic: true, size: 16 })}</w:p>`,
      ],
      [box(detail?.trim() || '')],
    ],
    [FULL],
  );

const KVKK_ADDRESS = 'Kişisel Verileri Koruma Kurumu Nasuh Akar Mahallesi Ziyabey Cad. 1407. Sok. No:4, 06520 Çankaya/Ankara';

/** FRM-020 EK-1 metni (şablondan aynen). */
const GUIDE = [
  'Eğer bu ilk bildirim ise doldurulan formu ihlalbildirimi@kvkk.gov.tr adresine “Kişisel veri ihlali bildirimi” konulu bir e-posta ekiyle gönderiniz. (e-posta yolu ile göndereceğiniz form ve eklerinin güvenli şekilde Kurumumuza ulaştırılmasının sorumluluğunun sizde olduğunu unutmayınız.)',
  'Eğer bu bir takip bildirimi ise bu formu ilk bildirimde göndermiş olduğumuz e-postanın ekine ekleyiniz. (e-postadaki konu satırını olduğu gibi bırakınız, bu sayede takip bildiriminiz olayınıza eklenebilecektir.)',
  'Bu formu posta ile göndermek istemeniz durumunda onaylı olarak aşağıda belirtilen adresimize gönderiniz.',
  'Varsa formda yer verilen bilgileri destekleyici dokümanları da (İnceleme raporu, ilgili kişilere bildirim yapıldığını tevsik edici belgeler vb.) forma eklemeyi unutmayınız.',
  'Atacağınız bir sonraki adımı belirlemek için 24.01.2019 tarih ve 2019/10 sayılı Kişisel Verileri Koruma Kurulu Kararını okumanızı tavsiye ederiz.',
  'Eğer bu formu doldurma konusunda yardıma ihtiyacınız varsa ALO 198 VERİ KORUMA hattımıza ulaşabilirsiniz.',
];

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

export function buildFrm020Docx(data: Frm020Data): Buffer {
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body(data)}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/document.xml', document);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
