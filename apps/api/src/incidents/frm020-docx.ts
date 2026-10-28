import {
  INCIDENT_CYBER_ELEMENTS,
  INCIDENT_CYBER_IMPACTS,
  INCIDENT_CYBER_RECOVERIES,
  INCIDENT_LIKELIHOODS,
  INCIDENT_ORG_IMPACTS,
  INCIDENT_PERSONAL_DATA_CATEGORIES,
  INCIDENT_RECOVERIES,
  INCIDENT_SOURCES,
  INCIDENT_SPECIAL_DATA_CATEGORIES,
  INCIDENT_SUBJECT_EFFECTS,
  INCIDENT_SUBJECT_GROUPS,
  INCIDENT_SUBJECT_NOTICES,
  IncidentForm,
  IncidentLikelihood,
  IncidentNotificationType,
  IncidentSubjectNotice,
} from '@kvkk/shared';
import PizZip from 'pizzip';

/**
 * Olay kaydından doldurulmuş FRM-020 "Kişisel Veri İhlali Bildirim Formu" Word dosyası üretir.
 * Asıl şablon PDF'ten dönüştürülmüş, alan yeri olmayan bir dosya olduğu için doldurulamıyor; bunun yerine
 * aynı soru metinleri, seçenekler ve sırayla yeni bir belge yazılır. İşaretli seçenekler ☒, diğerleri ☐ olur.
 * Kullanıcı dosyayı Kurula göndermeden önce Word'de düzenleyebilir.
 */
export interface Frm020Data {
  notificationType: IncidentNotificationType;
  followUpRef: string | null;
  occurredAt: Date | null;
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

function cell(content: string, width: number, fill?: string) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>` +
    `${content || '<w:p/>'}</w:tc>`
  );
}

function table(rows: string[][], widths: number[], header = false) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
    .join('');
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows
    .map((r, i) => `<w:tr>${r.map((c, j) => cell(c, widths[j], header && i === 0 ? 'E6EEF0' : undefined)).join('')}</w:tr>`)
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

const checkList = (options: readonly string[], selected: string[]) =>
  options.map((o) => para(mark(selected.includes(o), o), { indent: 200, spaceBefore: 20, spaceAfter: 20 })).join('');

const checkCell = (options: readonly string[], selected: string[]) =>
  options.map((o) => `<w:p>${mark(selected.includes(o), o)}</w:p>`).join('');

/** "Diğer (...) :" satırı; açıklama varsa işaretli. */
const other = (label: string, detail: string | null) =>
  para([mark(!!detail?.trim(), label), run(detail?.trim() ? ` ${detail.trim()}` : '')], { indent: 200 });

function impactTable(options: Record<string, { label: string; description: string }>, selected: string | null) {
  const rows = [[box('Etkisi'), box('Açıklama')]];
  for (const [key, o] of Object.entries(options)) {
    rows.push([`<w:p>${mark(selected === key, o.label)}</w:p>`, box(o.description)]);
  }
  return table(rows, [2200, FULL - 2200], true);
}

function recoveryTable(options: Record<string, { label: string; description: string }>, selected: string | null) {
  const rows = Object.entries(options).map(([key, o]) => [`<w:p>${mark(selected === key, o.label)}</w:p>`, box(o.description)]);
  return table(rows, [2200, FULL - 2200]);
}

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

const labelValue = (label: string, value: string | null | undefined) =>
  para([run(`${label} `, { bold: true }), run(value?.trim() || '')], { spaceBefore: 40, spaceAfter: 40 });

const count = (n: number | null) => (n === null ? '……………………' : n.toLocaleString('tr-TR'));

function body(d: Frm020Data) {
  const f = d.form;
  const out: string[] = [];
  out.push(para(run('Kişisel Veri İhlali Bildirim Formu', { bold: true, size: 32, color: SECTION_FILL }), { align: 'center', spaceAfter: 200 }));

  out.push(section('A) HAKKINIZDA'));
  out.push(labelValue('Veri sorumlusunun unvanı/ ismi:', f.controllerName));
  out.push(labelValue('Veri sorumlusunun adresi:', f.controllerAddress));
  out.push(labelValue('Bu bildirimi hazırlayan kişinin Adı ve Soyadı:', f.preparerName));
  out.push(labelValue('Görevi:', f.preparerTitle));
  out.push(labelValue('E-postası:', f.preparerEmail));
  out.push(labelValue('Telefonu:', f.preparerPhone));

  out.push(section('B) İHLAL HAKKINDA'));
  out.push(question('Bildirim türü :'));
  out.push(para(mark(d.notificationType === 'initial', 'İlk bildirim'), { indent: 200 }));
  out.push(
    para(
      [
        mark(d.notificationType === 'follow_up', 'Takip bildirimi:'),
        run(d.followUpRef?.trim() ? ` ${d.followUpRef.trim()}` : '.....................................'),
      ],
      { indent: 200 },
    ),
  );
  out.push(para(run('(Takip Bildirimlerinde varsa takip numarasını ekleyeniz)', { italic: true, size: 16 }), { indent: 200 }));
  out.push(labelValue('İhlalin gerçekleşme tarihi ve saati :', formatDateTime(d.occurredAt)));
  out.push(labelValue('İhlalin tespit tarihi ve saati:', formatDateTime(d.detectedAt)));

  out.push(question('İhlal hakkında bilgi veriniz.'));
  out.push(answer(f.description));

  out.push(question('İhlalin kaynağı', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(checkList(INCIDENT_SOURCES, f.sources));
  out.push(other('Diğer (Cevabınızı detaylandırınız) :', f.sourceOther));

  out.push(question('İhlalden etkilenen kişisel veri kategorileri', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'));
  out.push(
    table(
      [
        [box('Kişisel Veri'), box('Özel Nitelikli Kişisel Veri')],
        [checkCell(INCIDENT_PERSONAL_DATA_CATEGORIES, f.personalCategories), checkCell(INCIDENT_SPECIAL_DATA_CATEGORIES, f.specialCategories)],
      ],
      [FULL / 2, FULL / 2],
      true,
    ),
  );
  out.push(other('Diğer (Detayları belirtiniz) :', f.categoryOther));

  out.push(question('İhlalden etkilenen tahmini kişi ve kayıt sayısı'));
  out.push(
    para([run('Tahmini Kişi Sayısı : ', { bold: true }), run(count(f.estimatedPeople)), run('          '), run('Tahmini Kayıt Sayısı : ', { bold: true }), run(count(f.estimatedRecords))], {
      indent: 200,
    }),
  );

  out.push(
    question('İhlalden etkilenen ilgili kişi grupları ve etkileri', '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)'),
  );
  out.push(
    table(
      [
        [box('İlgili Kişi Grupları'), box('İlgili Kişiler Üzerindeki Etkileri')],
        [checkCell(INCIDENT_SUBJECT_GROUPS, f.subjectGroups), checkCell(INCIDENT_SUBJECT_EFFECTS, f.subjectEffects)],
        [
          `<w:p>${mark(!!f.subjectGroupOther?.trim(), 'Diğer (Detayları belirtiniz) :')}${run(f.subjectGroupOther?.trim() ? ` ${f.subjectGroupOther.trim()}` : '')}</w:p>`,
          `<w:p>${mark(!!f.subjectEffectOther?.trim(), 'Diğer (Detayları belirtiniz) :')}${run(f.subjectEffectOther?.trim() ? ` ${f.subjectEffectOther.trim()}` : '')}</w:p>`,
        ],
      ],
      [FULL / 2, FULL / 2],
      true,
    ),
  );

  out.push(question('Bildirimin yapılmasında herhangi bir gecikme yaşandıysa sebebini açıklayınız.', '(Yalnızca ilk bildirimler için)'));
  out.push(answer(d.notificationType === 'initial' ? f.delayReason : null));

  out.push(section('C) OLASI SONUÇLAR'));
  out.push(
    question(
      'İhlalin potansiyel etkileri hakkında bilgi veriniz.',
      '(İhlalin ilgili kişiler üzerinde doğurabileceği etkileri tarif ediniz. Eğer halihazırda ilgili kişiler üzerinde bir zarar meydana geldiyse belirtiniz.)',
    ),
  );
  out.push(answer(f.potentialEffects));
  out.push(question('İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı *'));
  out.push(inline((['high', 'medium', 'low'] as IncidentLikelihood[]).map((k) => [f.likelihood === k, INCIDENT_LIKELIHOODS[k]])));
  out.push(
    para(
      [
        mark(f.likelihood === 'unknown', 'Daha bilinmiyor (Cevabınızı detaylandırınız) :'),
        run(f.likelihood === 'unknown' && f.likelihoodDetail?.trim() ? ` ${f.likelihoodDetail.trim()}` : ''),
      ],
      { indent: 200 },
    ),
  );
  out.push(question('İhlalin organizasyonunuza olan etkileri'));
  out.push(impactTable(INCIDENT_ORG_IMPACTS, f.orgImpact));
  out.push(question('İyileşme zamanı ile ilgili bilgiler'));
  out.push(recoveryTable(INCIDENT_RECOVERIES, f.orgRecovery));

  out.push(section('D) VARSA SİBER SALDIRIYA ÖZGÜ SONUÇLAR'));
  out.push(question('Bilgi sistemleriniz siber saldırıdan etkilendi mi?'));
  out.push(yesNo(f.cyberAttack));
  out.push(
    question(
      'Evet seçeneğini işaretlediyseniz, siber saldırı sonucu gerçekleşen ihlal unsurunu belirtiniz.',
      '(Birden çok uyan seçenek bulunması halinde hepsini işaretleyiniz)',
    ),
  );
  const cyber = f.cyberAttack === true;
  out.push(checkList(INCIDENT_CYBER_ELEMENTS, cyber ? f.cyberElements : []));
  out.push(other('Diğer (Cevabınızı detaylandırınız) :', cyber ? f.cyberElementOther : null));
  out.push(question('Siber saldırıların organizasyonunuza olan etkileri'));
  out.push(impactTable(INCIDENT_CYBER_IMPACTS, cyber ? f.cyberImpact : null));
  out.push(question('İyileşme zamanı ile ilgili bilgiler'));
  out.push(recoveryTable(INCIDENT_CYBER_RECOVERIES, cyber ? f.cyberRecovery : null));

  out.push(section('E) ÖNLEMLER'));
  out.push(question('İhlal ile ilgili olan çalışanlar son bir yıl içerisinde kişisel veri koruma eğitimi aldı mı?'));
  out.push(yesNo(f.staffTrained));
  out.push(question('Bu tür ihlalleri engellemek için ihlalin gerçekleşmesinden önce almış olduğunuz idari ve teknik tedbirlerini belirtiniz.'));
  out.push(answer(f.measuresBefore));
  out.push(
    question(
      'İhlalin sonucu olarak almış olduğunuz veya almayı planladığınız idari ve teknik tedbirleri belirtiniz.',
      '(Problemi çözmek ve olumsuz etkilerini ortadan kaldırmak adına almış olduğunuz önlemleri belirtiniz; örneğin yanlışlıkla gönderilmiş olan verilerin yok edilmesi, parolaların güvenliğinin sağlanması, veri güvenliği eğitimi planlanması vb.)',
    ),
  );
  out.push(answer(f.measuresAfter));
  out.push(question('İhlalin tekrarlanmaması için atılan adımlar ve bunların tahminen ne zaman tamamlanacağı hakkında bilgi veriniz.'));
  out.push(answer(f.recurrenceSteps));
  out.push(question('İlgili kişilere ihlal bildirimi yapıldı mı?'));
  for (const [key, label] of Object.entries(INCIDENT_SUBJECT_NOTICES) as [IncidentSubjectNotice, string][]) {
    out.push(para(mark(f.subjectNotice === key, label), { indent: 200, spaceBefore: 20, spaceAfter: 20 }));
  }
  out.push(question('İlgili kişilere hangi yöntemle bildirim yapıldığı/yapılacağı hakkında detaylı bilgi veriniz.'));
  out.push(answer(f.subjectNoticeMethod));
  out.push(
    question(
      'İlgili kişilerin veri ihlali ile ilgili bilgi almalarını sağlayacak kişinin adı-soyadı ve iletişim bilgisi ya da veri sorumlusu web adresi',
    ),
  );
  out.push(answer(f.subjectContact));
  out.push(
    question(
      'Yurtiçinde bulunan diğer organizasyon veya kurumlara ihlal hakkında bilgi verildi mi veya vermeyi düşünüyor musunuz?',
      '(Örn. polis, diğer denetim ya da gözetim kurumları. Diğer kurumlar ile iletişime geçmeniz gerekebilir.)',
    ),
  );
  out.push(yesNo(f.domesticInformed));
  out.push(para(run('Evet seçeneğini işaretlediyseniz açıklayınız:', { bold: true })));
  out.push(answer(f.domesticInformed ? f.domesticDetail : null));
  out.push(
    question(
      'Yurtdışında bulunan diğer veri koruma otoriteleri veya ilgili kurumlara ihlal hakkında bilgi verildi mi veya vermeyi düşünüyor musunuz?',
      '(Örn. polis, diğer denetim ya da gözetim kurumları. )',
    ),
  );
  out.push(yesNo(f.foreignInformed));
  out.push(para(run('Evet seçeneğini işaretlediyseniz açıklayınız:', { bold: true })));
  out.push(answer(f.foreignInformed ? f.foreignDetail : null));

  out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  out.push(section('EK 1- VERİ İHLAL BİLDİRİM FORM REHBERİ'));
  for (const text of GUIDE) out.push(para(run(text, { size: 18 }), { align: 'both' }));
  for (const [label, text] of RISK_LEVELS) {
    out.push(para([run(`${label} `, { bold: true, size: 18 }), run(text, { size: 18 })], { align: 'both', indent: 200 }));
  }
  return out.join('');
}

/** FRM-020 EK-1 metni (şablondan aynen). */
const GUIDE = [
  'Eğer bu ilk bildirim ise doldurulan formu ihlalbildirimi@kvkk.gov.tr adresine “Kişisel veri ihlali bildirimi” konulu bir e-posta ekiyle gönderiniz. (e-posta yolu ile göndereceğiniz form ve eklerinin güvenli şekilde Kurumumuza ulaştırılmasının sorumluluğunun sizde olduğunu unutmayınız.)',
  'Eğer bu bir takip bildirimi ise bu formu ilk bildirimde göndermiş olduğumuz e-postanın ekine ekleyiniz. (e-postadaki konu satırını olduğu gibi bırakınız, bu sayede takip bildiriminiz olayınıza eklenebilecektir.)',
  'Bu formu posta ile göndermek istemeniz durumunda onaylı olarak aşağıda belirtilen adresimize gönderiniz. Kişisel Verileri Koruma Kurumu Nasuh Akar Mahallesi 1407. Sok. No:4, 06520 Balgat-Çankaya / Ankara',
  'Varsa formda yer verilen bilgileri destekleyici dokümanları da (İnceleme raporu, ilgili kişilere bildirim yapıldığını tevsik edici belgeler vb.) forma eklemeyi unutmayınız.',
  'Eğer bildiriminiz halihazırda mevcut bir olaya ilişkinse, olayınızla ilgilenen kişilerin bilgi sahibi olabilmesi için bildiriminiz olay dosyasına eklenecektir.',
  'Atacağınız bir sonraki adımı belirlemek için 24.01.2019 tarih ve 2019/10 sayılı Kişisel Verileri Koruma Kurulu Kararını okumanızı tavsiye ederiz.',
  'Eğer bu formu doldurma konusunda yardıma ihtiyacınız varsa ALO VERİ KORUMA 198 numaralı yardım hattımıza ulaşabilirsiniz.',
  'Gerçekleşen veri ihlalinin düzeyinin belirlenmesinde ilgili kişiler üzerinde ne kadar bir potansiyel etkiye neden olduğunun değerlendirilmesi gerekmektedir. Söz konusu potansiyel etkinin değerlendirilmesinde ise ihlalin niteliği, ihlalin nedeni, ihlale maruz kalan verinin türü, ihlalin etkisinin azaltılmasında alınan önlemler ile ihlalden etkilenen ilgili kişi kategorileri göz önünde bulundurulmalıdır. Risk düzeyinin belirlenmesinde aşağıdaki açıklamalar dikkate alınır.',
];

const RISK_LEVELS: [string, string][] = [
  ['Düşük düzeyde risk:', 'İhlal ilgili kişiler üzerinde olumsuz herhangi bir etkiye neden olmamakta ya da bu bu etki ihmal edilebilir düzeyde kalmaktadır.'],
  ['Orta düzeyde risk:', 'İhlal ilgili kişiler üzerinde olumsuz etkilere neden olabilir fakat bu etki büyük değildir.'],
  ['Yüksek düzeyde risk:', 'İhlal etkilenen kişiler üzerinde ciddi düzeyde olumsuz etkilere neden olmaktadır.'],
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
