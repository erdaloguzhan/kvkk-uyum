/**
 * "KVKK Farkındalık Eğitimi" alt konuları ile ön test ve son test soruları.
 *
 * Kaynak: Erdal'ın "uzaktan eğitim dersler.docx" dosyası (2026-11-08). Metin olduğu gibi alındı; yalnızca
 * yazım hataları düzeltildi, idari para cezası tutarları 2026 yılı tutarlarıyla, 6. madde ise 7499 sayılı
 * Kanunla yapılan değişiklikle güncellendi. Her konunun görseli `assets/egitim/kvkk-farkindalik/NN.png`
 * dosyasıdır ve içerikte `{{gorsel}}` yazan yere eklenir.
 */

export interface TopicSeed {
  title: string;
  /** Görsel dosyası (assets/egitim/kvkk-farkindalik altında). */
  image: string;
  imageAlt: string;
  content: string;
}

export interface QuestionSeed {
  text: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
}

export const TRAINING_NAME = 'KVKK Farkındalık Eğitimi';

export const TOPICS: TopicSeed[] = [
  {
    title: 'Kişisel Veri ve Özel Nitelikli Kişisel Veri Nedir?',
    image: '01.png',
    imageAlt: 'Kimlik kartı ve kalkan',
    content: `{{gorsel}}

## Kişisel veri nedir?

Ad, soyad, kimlik no, pasaport no, cep telefonu no, medeni durum, adres, özgeçmiş gibi kişiye ait her türlü bilgi **kişisel veridir**.

Kişisel veriler, kişinin izni veya istisnai durumlar dışında paylaşılamaz ve işlenemez.

## Özel nitelikli kişisel veri nedir?

Irk, etnik köken, siyasi düşünce, dini inanç, felsefi inanç, dernek/vakıf/sendika üyeliği, cezai mahkûmiyet ve tedbirler, biyometrik ve genetik veriler, sağlık verileri **özel nitelikli kişisel veridir**.

Özel nitelikli kişisel veriler, kişinin izni ve kanunda belirtilen istisnai durumlar dışında işlenemez.`,
  },
  {
    title: 'Kişisel Verilerle İlgili Mevzuat Hangileridir?',
    image: '02.png',
    imageAlt: 'Kanun kitabı ve adalet terazisi',
    content: `{{gorsel}}

Kişisel verilerin korunmasına ilişkin başlıca mevzuat şunlardır:

- Anayasa
- 6698 sayılı Kişisel Verilerin Korunması Kanunu
- 5237 sayılı Türk Ceza Kanunu
- Kişisel verilerin korunması ile ilgili yönetmelikler
- Kişisel verilerin korunması ile ilgili tebliğler`,
  },
  {
    title: 'Kişisel Verilerin İşlenme Şartları Nelerdir?',
    image: '03.png',
    imageAlt: 'Onay işaretli kontrol listesi',
    content: `{{gorsel}}

## 6698 sayılı Kanun, Madde 5

(1) Kişisel veriler ilgili kişinin açık rızası olmaksızın işlenemez.

(2) Aşağıdaki şartlardan birinin varlığı hâlinde, ilgili kişinin açık rızası aranmaksızın kişisel verilerinin işlenmesi mümkündür:

- a) Kanunlarda açıkça öngörülmesi.
- b) Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan veya rızasına hukuki geçerlilik tanınmayan kişinin kendisinin ya da bir başkasının hayatı veya beden bütünlüğünün korunması için zorunlu olması.
- c) Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.
- ç) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması.
- d) İlgili kişinin kendisi tarafından alenileştirilmiş olması.
- e) Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması.
- f) İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması.`,
  },
  {
    title: 'Özel Nitelikli Kişisel Verilerin İşlenme Şartları Nelerdir?',
    image: '04.png',
    imageAlt: 'Kilitli kalkan ve kalp atışı',
    content: `{{gorsel}}

## 6698 sayılı Kanun, Madde 6

(1) Kişilerin ırkı, etnik kökeni, siyasi düşüncesi, felsefi inancı, dini, mezhebi veya diğer inançları, kılık ve kıyafeti, dernek, vakıf ya da sendika üyeliği, sağlığı, cinsel hayatı, ceza mahkûmiyeti ve güvenlik tedbirleriyle ilgili verileri ile biyometrik ve genetik verileri özel nitelikli kişisel veridir.

(3) Özel nitelikli kişisel verilerin işlenmesi yasaktır. Ancak bu verilerin işlenmesi aşağıdaki hâllerden birinin varlığı hâlinde mümkündür:

- a) İlgili kişinin açık rızasının olması.
- b) Kanunlarda açıkça öngörülmesi.
- c) Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan veya rızasına hukuki geçerlilik tanınmayan kişinin kendisinin ya da bir başkasının hayatı veya beden bütünlüğünün korunması için zorunlu olması.
- ç) İlgili kişinin alenileştirdiği kişisel verilere ilişkin ve alenileştirme iradesine uygun olması.
- d) Bir hakkın tesisi, kullanılması veya korunması için zorunlu olması.
- e) Sır saklama yükümlülüğü altında bulunan kişiler veya yetkili kurum ve kuruluşlar tarafından kamu sağlığının korunması, koruyucu hekimlik, tıbbi teşhis, tedavi ve bakım hizmetlerinin yürütülmesi ile sağlık hizmetlerinin planlanması, yönetimi ve finansmanı amacıyla zorunlu olması.
- f) İstihdam, iş sağlığı ve güvenliği, sosyal güvenlik, sosyal hizmetler ve sosyal yardım alanlarındaki hukuki yükümlülüklerin yerine getirilmesi için zorunlu olması.
- g) Siyasi, felsefi, dini veya sendikal amaçlarla kurulan vakıf, dernek ve diğer kâr amacı gütmeyen kuruluş ya da oluşumların, tabi oldukları mevzuata ve amaçlarına uygun olmak, faaliyet alanlarıyla sınırlı olmak ve üçüncü kişilere açıklanmamak kaydıyla; mevcut veya eski üyelerine ve mensuplarına veyahut bu kuruluş ve oluşumlarla düzenli olarak temasta olan kişilere yönelik olması.

(4) Özel nitelikli kişisel verilerin işlenmesinde, ayrıca Kurul tarafından belirlenen yeterli önlemlerin alınması şarttır.

> Not: 6. madde, 7499 sayılı Kanunla değiştirilmiş ve yeni hâli 1 Haziran 2024 tarihinde yürürlüğe girmiştir. Değişiklikten önce özel nitelikli veriler (sağlık ve cinsel hayat dışında) yalnızca açık rıza veya kanunda öngörülme hâlinde işlenebiliyordu.`,
  },
  {
    title: '6698 Sayılı Kişisel Verilerin Korunması Kanunundaki Cezalar',
    image: '05.png',
    imageAlt: 'Hâkim tokmağı ve para',
    content: `{{gorsel}}

## Beşinci Bölüm: Suçlar ve Kabahatler

### Suçlar

**Madde 17** (1) Kişisel verilere ilişkin suçlar bakımından 26/9/2004 tarihli ve 5237 sayılı Türk Ceza Kanununun 135 ila 140 ıncı madde hükümleri uygulanır.

(2) Bu Kanunun 7 nci maddesi hükmüne aykırı olarak; kişisel verileri silmeyen veya anonim hâle getirmeyenler 5237 sayılı Kanunun 138 inci maddesine göre cezalandırılır.

### Kabahatler

**Madde 18** (1) Bu Kanunun;

- a) 10 uncu maddesinde öngörülen **aydınlatma yükümlülüğünü** yerine getirmeyenler hakkında **85.437 Türk lirasından 1.709.200 Türk lirasına kadar**,
- b) 12 nci maddesinde öngörülen **veri güvenliğine ilişkin yükümlülükleri** yerine getirmeyenler hakkında **256.357 Türk lirasından 17.092.242 Türk lirasına kadar**,
- c) 15 inci maddesi uyarınca **Kurul tarafından verilen kararları** yerine getirmeyenler hakkında **427.263 Türk lirasından 17.092.242 Türk lirasına kadar**,
- ç) 16 ncı maddesinde öngörülen **Veri Sorumluları Siciline kayıt ve bildirim** yükümlülüğüne aykırı hareket edenler hakkında **341.809 Türk lirasından 17.092.242 Türk lirasına kadar**,
- d) 9 uncu maddesinin dördüncü fıkrasında öngörülen **yurt dışına aktarımda standart sözleşmeyi Kuruma bildirme** yükümlülüğünü yerine getirmeyenler hakkında **90.308 Türk lirasından 1.806.177 Türk lirasına kadar**

idari para cezası verilir.

(2) Bu maddede öngörülen idari para cezaları veri sorumlusu olan gerçek kişiler ile özel hukuk tüzel kişileri hakkında uygulanır.

(3) Birinci fıkrada sayılan eylemlerin kamu kurum ve kuruluşları ile kamu kurumu niteliğindeki meslek kuruluşları bünyesinde işlenmesi hâlinde, Kurulun yapacağı bildirim üzerine, ilgili kamu kurum ve kuruluşunda görev yapan memurlar ve diğer kamu görevlileri ile kamu kurumu niteliğindeki meslek kuruluşlarında görev yapanlar hakkında disiplin hükümlerine göre işlem yapılır ve sonucu Kurula bildirilir.

> Not: Yukarıdaki tutarlar 2026 yılında uygulanan tutarlardır. İdari para cezaları, 5326 sayılı Kabahatler Kanunu'nun 17/7. maddesi uyarınca her yıl Vergi Usul Kanunu'na göre belirlenen yeniden değerleme oranında artırılır. 2026 yılı için bu oran %25,49'dur (VUK Genel Tebliği Sıra No: 585, Resmî Gazete 27.11.2025).`,
  },
  {
    title: 'KVKK Terimleri',
    image: '06.png',
    imageAlt: 'A-Z sözlük kitabı',
    content: `{{gorsel}}

- **KVKK:** Kişisel Verilerin Korunması Kanunu.
- **Açık rıza:** Belirli bir konuya ilişkin, bilgilendirilmeye dayanan ve özgür iradeyle açıklanan rıza.
- **Anonim hâle getirme:** Kişisel verilerin, başka verilerle eşleştirilerek dahi hiçbir surette kimliği belirli veya belirlenebilir bir gerçek kişiyle ilişkilendirilemeyecek hâle getirilmesi.
- **İlgili kişi / Veri sahibi:** Kişisel verisi işlenen gerçek kişi.
- **Kişisel veri:** Kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgi.
- **Kişisel verilerin işlenmesi:** Kişisel verilerin tamamen veya kısmen otomatik olan ya da herhangi bir veri kayıt sisteminin parçası olmak kaydıyla otomatik olmayan yollarla elde edilmesi, kaydedilmesi, depolanması, muhafaza edilmesi, değiştirilmesi, yeniden düzenlenmesi, açıklanması, aktarılması, devralınması, elde edilebilir hâle getirilmesi, sınıflandırılması ya da kullanılmasının engellenmesi gibi veriler üzerinde gerçekleştirilen her türlü işlem.
- **Kurul:** Kişisel Verileri Koruma Kurulu.
- **Kurum:** Kişisel Verileri Koruma Kurumu.
- **Veri işleyen:** Veri sorumlusunun verdiği yetkiye dayanarak onun adına kişisel verileri işleyen gerçek veya tüzel kişi.
- **Veri kayıt sistemi:** Kişisel verilerin belirli kriterlere göre yapılandırılarak işlendiği kayıt sistemi.
- **Veri sorumlusu:** Kişisel verilerin işleme amaçlarını ve vasıtalarını belirleyen, veri kayıt sisteminin kurulmasından ve yönetilmesinden sorumlu olan gerçek veya tüzel kişi.
- **TCK:** Türk Ceza Kanunu.`,
  },
  {
    title: 'Açık Rıza Nedir?',
    image: '07.png',
    imageAlt: 'Onaylanmış belge',
    content: `{{gorsel}}

Belli bir konuya ilişkin, bilgilendirmeye dayanan ve özgür iradeyle açıklanan rızaya **açık rıza** denir.

Açık rıza aşağıdaki niteliklere sahip olmalıdır:

### 1. Belirli bir konuya ilişkin olma

- Genel nitelikte olmamalı,
- Belirli bir konu için verilmeli.

### 2. Bilgilendirmeye dayanma

- Verilerin hangi amaçla işleneceği açıkça belirtilmeli,
- Aydınlatma yükümlülüğü yerine getirilmeli.

### 3. Özgür iradeyle açıklanmış olma

- Ön şart sunulmamalı,
- Özgür bir irade beyanı olmalı.`,
  },
  {
    title: 'Aydınlatma Yükümlülüğü Nedir?',
    image: '08.png',
    imageAlt: 'Bilgilendirme belgesi ve hoparlör',
    content: `{{gorsel}}

Aydınlatma yükümlülüğü, **veri sorumlusu** tarafından veri sahibinin bilgilendirilmesidir.

Aydınlatma metni aşağıdaki bilgileri içermelidir:

1. Veri sorumlusunun kimliği
2. Kişisel verilerin hangi amaçla işlendiği
3. İşlenen verilerin kimlere aktarılabileceği
4. Kişisel verilerin nasıl toplandığı ve hukuki sebebi
5. Veri sahibinin hakları`,
  },
  {
    title: 'Kişisel Veri Sahibinin Hakları Nelerdir?',
    image: '09.png',
    imageAlt: 'Kişi ve haklar listesi',
    content: `{{gorsel}}

Kişisel veri sahibi (ilgili kişi), veri sorumlusuna başvurarak şu haklarını kullanabilir:

- Kişisel verisinin işlenip işlenmediğini öğrenme,
- İşlenmişse buna ilişkin bilgi talep etme,
- İşlenme amacını ve bu amaca uygun olarak kullanılıp kullanılmadığını öğrenme,
- Eksik/yanlış işlenmesi durumunda düzeltilmesini isteme,
- Verilerin yok edilmesini veya silinmesini isteme,
- Veriler aktarılmışsa, üçüncü kişilere bildirilmesini isteme,
- İşlenen verilerin analiz edilmesi suretiyle kişinin kendisi aleyhine bir sonucun ortaya çıkmasına itiraz etme,
- Hukuka aykırı işlenmesi hâlinde zarar görürse zararın giderilmesini talep etme.`,
  },
  {
    title: 'Kişisel Verilerin Korunması Neden Gereklidir?',
    image: '10.png',
    imageAlt: 'Kişiyi koruyan kalkan',
    content: `{{gorsel}}

Kişisel verilerin korunması ihtiyacı, Anayasamızın "Özel hayatın gizliliği ve korunması" bölümündeki 20. maddesi ile güvence altına alınmıştır:

### Anayasa, Madde 20: Özel hayatın gizliliği

Herkes, özel hayatına ve aile hayatına saygı gösterilmesini isteme hakkına sahiptir. Özel hayatın ve aile hayatının gizliliğine dokunulamaz.

Millî güvenlik, kamu düzeni, suç işlenmesinin önlenmesi, genel sağlık ve genel ahlâkın korunması veya başkalarının hak ve özgürlüklerinin korunması sebeplerinden biri veya birkaçına bağlı olarak, usulüne göre verilmiş hâkim kararı olmadıkça; yine bu sebeplere bağlı olarak gecikmesinde sakınca bulunan hâllerde de kanunla yetkili kılınmış merciin yazılı emri bulunmadıkça; kimsenin üstü, özel kâğıtları ve eşyası aranamaz ve bunlara el konulamaz. Yetkili merciin kararı yirmi dört saat içinde görevli hâkimin onayına sunulur. Hâkim, kararını el koymadan itibaren kırk sekiz saat içinde açıklar; aksi hâlde, el koyma kendiliğinden kalkar.

**Herkes, kendisiyle ilgili kişisel verilerin korunmasını isteme hakkına sahiptir.** Bu hak; kişinin kendisiyle ilgili kişisel veriler hakkında bilgilendirilme, bu verilere erişme, bunların düzeltilmesini veya silinmesini talep etme ve amaçları doğrultusunda kullanılıp kullanılmadığını öğrenmeyi de kapsar. Kişisel veriler, ancak kanunda öngörülen hâllerde veya kişinin açık rızasıyla işlenebilir. Kişisel verilerin korunmasına ilişkin esas ve usuller kanunla düzenlenir.

Bu hak, 7 Nisan 2016 tarihinde Resmî Gazete'de yayımlanan 6698 sayılı Kanun ile hayatımıza girmiştir. Dünyada gelişen teknoloji, artan veri ve veri transferi ile birlikte veri hırsızlığı ve verinin kötü amaçla kullanımı da artmış, verilerin korunması ihtiyacı ortaya çıkmıştır.`,
  },
  {
    title: 'Kimler Kişisel Verilerin Korunması Kanunu’na Tabidir?',
    image: '11.png',
    imageAlt: 'Kişiler ve kurum binası',
    content: `{{gorsel}}

## 6698 sayılı Kanun, Madde 2: Kapsam

(1) Bu Kanun hükümleri, kişisel verileri işlenen gerçek kişiler ile bu verileri tamamen veya kısmen otomatik olan ya da herhangi bir veri kayıt sisteminin parçası olmak kaydıyla otomatik olmayan yollarla işleyen gerçek ve tüzel kişiler hakkında uygulanır.

İstisnalar dışındaki bütün gerçek ve tüzel kişiler Kanuna tabidir. İstisnalar aşağıdaki gibidir.

## 6698 sayılı Kanun, Madde 28: İstisnalar

(1) Bu Kanun hükümleri aşağıdaki hâllerde uygulanmaz:

- a) Kişisel verilerin, üçüncü kişilere verilmemek ve veri güvenliğine ilişkin yükümlülüklere uyulmak kaydıyla gerçek kişiler tarafından tamamen kendisiyle veya aynı konutta yaşayan aile fertleriyle ilgili faaliyetler kapsamında işlenmesi.
- b) Kişisel verilerin resmi istatistik ile anonim hâle getirilmek suretiyle araştırma, planlama ve istatistik gibi amaçlarla işlenmesi.
- c) Kişisel verilerin millî savunmayı, millî güvenliği, kamu güvenliğini, kamu düzenini, ekonomik güvenliği, özel hayatın gizliliğini veya kişilik haklarını ihlal etmemek ya da suç teşkil etmemek kaydıyla, sanat, tarih, edebiyat veya bilimsel amaçlarla ya da ifade özgürlüğü kapsamında işlenmesi.
- ç) Kişisel verilerin millî savunmayı, millî güvenliği, kamu güvenliğini, kamu düzenini veya ekonomik güvenliği sağlamaya yönelik olarak kanunla görev ve yetki verilmiş kamu kurum ve kuruluşları tarafından yürütülen önleyici, koruyucu ve istihbari faaliyetler kapsamında işlenmesi.
- d) Kişisel verilerin soruşturma, kovuşturma, yargılama veya infaz işlemlerine ilişkin olarak yargı makamları veya infaz mercileri tarafından işlenmesi.

(2) Bu Kanunun amacına ve temel ilkelerine uygun ve orantılı olmak kaydıyla veri sorumlusunun aydınlatma yükümlülüğünü düzenleyen 10 uncu, zararın giderilmesini talep etme hakkı hariç, ilgili kişinin haklarını düzenleyen 11 inci ve Veri Sorumluları Siciline kayıt yükümlülüğünü düzenleyen 16 ncı maddeleri aşağıdaki hâllerde uygulanmaz:

- a) Kişisel veri işlemenin suç işlenmesinin önlenmesi veya suç soruşturması için gerekli olması.
- b) İlgili kişinin kendisi tarafından alenileştirilmiş kişisel verilerin işlenmesi.
- c) Kişisel veri işlemenin kanunun verdiği yetkiye dayanılarak görevli ve yetkili kamu kurum ve kuruluşları ile kamu kurumu niteliğindeki meslek kuruluşlarınca, denetleme veya düzenleme görevlerinin yürütülmesi ile disiplin soruşturma veya kovuşturması için gerekli olması.
- ç) Kişisel veri işlemenin bütçe, vergi ve mali konulara ilişkin olarak Devletin ekonomik ve mali çıkarlarının korunması için gerekli olması.`,
  },
  {
    title: 'Veri Güvenliği Tedbirleri Nelerdir?',
    image: '12.png',
    imageAlt: 'Sunucu, kilit ve kalkan',
    content: `{{gorsel}}

Veri güvenliği tedbirleri **idari** ve **teknik** olmak üzere ikiye ayrılır.

## İdari tedbirler

- Kişisel veri işleme envanteri hazırlanması
- Kurumsal politikalar (erişim, bilgi güvenliği, kullanım, saklama ve imha vb.)
- Sözleşmeler (veri sorumlusu ile veri sorumlusu, veri sorumlusu ile veri işleyen arasında)
- Gizlilik taahhütnameleri
- Kurum içi periyodik ve/veya rastgele denetimler
- Risk analizleri
- İş sözleşmesi, disiplin yönetmeliği (Kanuna uygun hükümler ilave edilmesi)
- Kurumsal iletişim (kriz yönetimi, Kurul ve ilgili kişiyi bilgilendirme süreçleri, itibar yönetimi vb.)
- Eğitim ve farkındalık faaliyetleri (bilgi güvenliği ve Kanun)
- Veri Sorumluları Sicil Bilgi Sistemine (VERBİS) bildirim

## Teknik tedbirler

- Yetki matrisi
- Yetki kontrol
- Erişim logları
- Kullanıcı hesap yönetimi
- Ağ güvenliği
- Uygulama güvenliği
- Şifreleme
- Sızma testi
- Saldırı tespit ve önleme sistemleri
- Log kayıtları
- Veri maskeleme
- Veri kaybı önleme yazılımları
- Yedekleme
- Güvenlik duvarları
- Güncel anti-virüs sistemleri
- Silme, yok etme veya anonim hâle getirme
- Anahtar yönetimi`,
  },
  {
    title: 'Kişisel Verilerin İşlenmesi Ne Demektir?',
    image: '13.png',
    imageAlt: 'Veritabanı ve işlem okları',
    content: `{{gorsel}}

Kişisel verilerin işlenmesi, kişisel verilerin tamamen veya kısmen otomatik olan ya da herhangi bir veri kayıt sisteminin parçası olmak kaydıyla otomatik olmayan yollarla elde edilmesi, kaydedilmesi, depolanması, muhafaza edilmesi, değiştirilmesi, yeniden düzenlenmesi, açıklanması, aktarılması, devralınması, elde edilebilir hâle getirilmesi, sınıflandırılması ya da kullanılmasının engellenmesi gibi veriler üzerinde gerçekleştirilen her türlü işlemi ifade eder.

**Örneğin**, kişisel verilerin sadece bir hard diskte, CD'de, sunucuda depolanması, anılan verilerle başkaca hiçbir işlem yapılmasa da bir veri işleme faaliyetidir.

Dolayısıyla veri işleme kapsamına giren eylemler sınırlı sayıda olmayıp, kişisel verilerin ilk defa elde edilmesinden başlayarak veriler üzerinde gerçekleştirilen tüm işlem türlerini ifade etmektedir.`,
  },
  {
    title: 'Kişisel Verilerin İşlenmesinde Temel İlkeler Nelerdir?',
    image: '14.png',
    imageAlt: 'Beş sütunlu yapı',
    content: `{{gorsel}}

Kişisel verilerin işlenmesinde her zaman Kanunda ortaya konulan genel ilkelere uygun davranılmalıdır. Kişisel verilerin işlenmesinde genel ilkeler şunlardır:

- a) Hukuka ve dürüstlük kurallarına uygun olma,
- b) Doğru ve gerektiğinde güncel olma,
- c) Belirli, açık ve meşru amaçlar için işlenme,
- ç) İşlendikleri amaçla bağlantılı, sınırlı ve ölçülü olma,
- d) İlgili mevzuatta öngörülen veya işlendikleri amaç için gerekli olan süre kadar muhafaza edilme.

Kişisel verilerin işlenmesine ilişkin ilkeler, tüm kişisel veri işleme faaliyetlerinin özünde bulunmalı ve tüm kişisel veri işleme faaliyetleri bu ilkelere uygun olarak gerçekleştirilmelidir.`,
  },
  {
    title: 'Kişisel Verilerin Aleni Olması Ne Demektir?',
    image: '15.png',
    imageAlt: 'Herkese açık bilgi ve göz',
    content: `{{gorsel}}

Herhangi bir şekilde ilgili kişi tarafından kamuoyuna açıklanmış olan, bir başka ifadeyle ilgili kişinin kendisi tarafından alenileştirilen kişisel veriler, alenileştirme amacına uygun bir şekilde açık rıza aranmaksızın işlenebilecektir. Çünkü ilgili kişi tarafından alenileştirilen ve böylelikle herkes tarafından bilinebilecek hâle gelen bu tür verilerin işlenmesinde, korunması gereken hukuki yararın ortadan kalktığı kabul edilmektedir.

Kişisel verinin aleni kabul edilebilmesi için ait olduğu kişinin aleni olmasını istemesi gerekir. Başka bir ifade ile alenileştirmenin gerçekleşebilmesi için **alenileştirme iradesinin** varlığı gerekir. Yoksa bir kişinin kişisel verisinin herkesin görebileceği bir yerde olması aleni olmasını sağlamaz.

Ayrıca, alenileştirme durumunda kişisel verinin amacı dışında da kullanılmaması gerekmektedir.

**Örneğin**, ikinci el araç satışı yapılan internet sitelerinde aracını satmak isteyen ilgili kişinin iletişim bilgilerinin pazarlama amaçlarıyla kullanılması mümkün değildir.`,
  },
  {
    title: 'Kişisel Verilerin Anonim Hâle Getirilmesi Ne Demektir?',
    image: '16.png',
    imageAlt: 'Kimliği gizlenmiş kişi silueti',
    content: `{{gorsel}}

Anonim hâle getirme, kişisel verilerin başka verilerle eşleştirilse dahi kimliği belirli veya belirlenebilir bir gerçek kişiyle ilişkilendirilemeyecek hâle getirilmesidir.

Diğer bir ifade ile anonim hâle getirme, bir veri kümesindeki tüm doğrudan ve dolaylı tanımlayıcıların çıkarılarak veya değiştirilerek ilgili kişinin kimliğinin saptanabilmesinin engellenmesi ya da verinin bir grup veya kalabalık içinde ayırt edilebilir olma özelliğini, bir gerçek kişi ile ilişkilendirilemeyecek şekilde kaybetmesidir.

Bu kapsamda, veri üzerinden bir izleme yapılarak başka verilerle eşleştirme ve destekleme sonrasında verinin kime ait olduğu anlaşılabiliyorsa, **bu verinin anonim hâle getirildiği kabul edilemez**.

Anonim hâle getirilen veri artık kişisel veri niteliklerine sahip olmayacağından, Kanun hükümleri kapsamında değerlendirilemeyecektir. Veri setleri anonim hâle getirilme işlemlerine tabi tutuldukları ana kadar kişisel veri niteliklerine sahip olduklarından, bu veriler üzerinde gerçekleştirilecek her türlü işlem kişisel veri işleme faaliyeti sayılır ve Kanun hükümlerine tabidir.`,
  },
  {
    title: 'Veri Sorumluları Sicili Nedir?',
    image: '17.png',
    imageAlt: 'Sicil defteri ve büyüteç',
    content: `{{gorsel}}

**Veri Sorumluları Sicili (VERBİS)**, veri sorumlularının kaydedildiği, Kişisel Verileri Koruma Kurulunun gözetiminde Başkanlık tarafından kamuya açık olarak tutulan sicildir.

Kişisel verileri işleyen gerçek ve tüzel kişiler, veri işlemeye başlamadan önce Veri Sorumluları Siciline kaydolmak zorundadır.

Ancak, işlenen kişisel verinin niteliği, sayısı, veri işlemenin kanundan kaynaklanması veya üçüncü kişilere aktarılma durumu gibi Kurulca belirlenecek objektif kriterler göz önüne alınmak suretiyle, Kurul tarafından Veri Sorumluları Siciline kayıt zorunluluğuna istisna getirilebilir.

Ayrıca Kanunun 28. maddesi kapsamındaki hâllerde de veri sorumlularının sicile kayıt yükümlülüğü bulunmamaktadır.`,
  },
];

export const PRE_TEST: QuestionSeed[] = [
  {
    text: 'Aşağıdakilerden hangisi kişisel veri değildir?',
    options: ['Cep telefonu numarası', 'T.C. kimlik numarası', 'Kimseyle ilişkilendirilemeyecek şekilde anonim hâle getirilmiş istatistik', 'Özgeçmiş'],
    correct: 'C',
  },
  {
    text: 'Aşağıdakilerden hangisi özel nitelikli kişisel veridir?',
    options: ['Ev adresi', 'Sağlık verisi', 'Medeni durum', 'Pasaport numarası'],
    correct: 'B',
  },
  {
    text: 'Açık rızanın nitelikleri hangi seçenekte doğru verilmiştir?',
    options: [
      'Belirli bir konuya ilişkin olma, bilgilendirmeye dayanma, özgür iradeyle açıklanma',
      'Genel nitelikte olma, sözlü verilme, süresiz olma',
      'Noter onaylı olma, yazılı olma, tek seferlik olma',
      'Hizmetin ön şartı olarak alınma, genel olma, geri alınamama',
    ],
    correct: 'A',
  },
  {
    text: 'Aydınlatma yükümlülüğünü yerine getirmek kimin görevidir?',
    options: ['İlgili kişinin (veri sahibinin)', 'Kişisel Verileri Koruma Kurulunun', 'Veri sorumlusunun', 'Mahkemenin'],
    correct: 'C',
  },
  {
    text: 'Kişisel verilerin, başka hiçbir işlem yapılmadan yalnızca bir sunucuda depolanması için hangisi doğrudur?',
    options: [
      'Veri işleme sayılmaz',
      'Bir veri işleme faaliyetidir',
      'Yalnızca veriler paylaşılırsa veri işleme sayılır',
      'Yalnızca özel nitelikli verilerde veri işleme sayılır',
    ],
    correct: 'B',
  },
  {
    text: 'Veri sorumlusunun verdiği yetkiye dayanarak onun adına kişisel verileri işleyen gerçek veya tüzel kişiye ne ad verilir?',
    options: ['İlgili kişi', 'Veri sorumlusu', 'Veri işleyen', 'Kurul'],
    correct: 'C',
  },
  {
    text: 'Aşağıdakilerden hangisi teknik bir veri güvenliği tedbiridir?',
    options: ['Gizlilik taahhütnamesi', 'Şifreleme', 'Eğitim ve farkındalık faaliyetleri', 'Kurumsal politikalar'],
    correct: 'B',
  },
  {
    text: 'Veri sorumlularının kaydedildiği ve kamuya açık olarak tutulan sicil hangisidir?',
    options: ['Veri Sorumluları Sicili (VERBİS)', 'Ticaret Sicili (MERSİS)', 'Adli Sicil', 'Tapu Sicili'],
    correct: 'A',
  },
  {
    text: 'Kişisel verilere ilişkin suçlar bakımından hangi kanunun 135 ila 140. maddeleri uygulanır?',
    options: ['6098 sayılı Türk Borçlar Kanunu', '5237 sayılı Türk Ceza Kanunu', '4857 sayılı İş Kanunu', '6102 sayılı Türk Ticaret Kanunu'],
    correct: 'B',
  },
  {
    text: 'Aşağıdakilerden hangisi kişisel veri sahibinin (ilgili kişinin) haklarından biri değildir?',
    options: [
      'Kişisel verisinin işlenip işlenmediğini öğrenme',
      'Eksik veya yanlış işlenmişse düzeltilmesini isteme',
      'Zarar görürse zararın giderilmesini talep etme',
      'Veri sorumlusunun diğer müşterilerinin kişisel verilerini isteme',
    ],
    correct: 'D',
  },
];

export const POST_TEST: QuestionSeed[] = [
  {
    text: 'Aşağıdakilerden hangisi, Kanunun 5. maddesine göre açık rıza aranmaksızın kişisel veri işleme şartlarından biri değildir?',
    options: [
      'Kanunlarda açıkça öngörülmesi',
      'Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması',
      'Veri sorumlusunun satışlarını artırmak istemesi',
      'Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması',
    ],
    correct: 'C',
  },
  {
    text: 'İş yerinde bir müşterinin kimlik fotokopisini herkesin görebileceği bir masada unuttuğunuzu fark ettiniz. Bu durum en çok hangi yükümlülükle ilgilidir?',
    options: [
      'Aydınlatma yükümlülüğü',
      'Veri güvenliğine ilişkin yükümlülükler',
      'Veri Sorumluları Siciline (VERBİS) kayıt yükümlülüğü',
      'Açık rıza alma yükümlülüğü',
    ],
    correct: 'B',
  },
  {
    text: 'Bir iş arkadaşınız, işiniz gereği tuttuğunuz müşteri listesindeki telefon numaralarını kendi kişisel satış işi için istiyor. Ne yapmalısınız?',
    options: [
      'Vermemelisiniz; kişisel veriler yalnızca toplandıkları amaçla bağlantılı, sınırlı ve ölçülü olarak işlenebilir',
      'Verebilirsiniz; numaralar zaten şirketin kayıtlarında bulunuyor',
      'Yalnızca birkaç numara verebilirsiniz',
      'Müşterilere sonradan haber vermek şartıyla verebilirsiniz',
    ],
    correct: 'A',
  },
  {
    text: 'Anonim hâle getirme ile ilgili hangisi doğrudur?',
    options: [
      'Anonim hâle getirilen veri kişisel veri olmaya devam eder',
      'Başka verilerle eşleştirildiğinde kime ait olduğu anlaşılabiliyorsa veri anonim hâle getirilmiş sayılmaz',
      'Yalnızca ad ve soyadın silinmesi her durumda yeterlidir',
      'Anonim veriler yalnızca açık rızayla işlenebilir',
    ],
    correct: 'B',
  },
  {
    text: 'İkinci el araç satış sitesinde ilan veren kişinin telefon numarası için hangisi doğrudur?',
    options: [
      'Herkese açık olduğu için her amaçla kullanılabilir',
      'Pazarlama amacıyla kullanılabilir',
      'Yalnızca alenileştirme amacına uygun olarak (araç satışıyla ilgili) kullanılabilir',
      'Hiçbir şekilde kullanılamaz',
    ],
    correct: 'C',
  },
  {
    text: 'Aşağıdakilerden hangisi kişisel verilerin işlenmesinde temel ilkelerden biri değildir?',
    options: [
      'Hukuka ve dürüstlük kurallarına uygun olma',
      'Doğru ve gerektiğinde güncel olma',
      'Mümkün olan en uzun süre saklanma',
      'İşlendikleri amaçla bağlantılı, sınırlı ve ölçülü olma',
    ],
    correct: 'C',
  },
  {
    text: 'Aşağıdakilerden hangisi idari bir veri güvenliği tedbiridir?',
    options: ['Güvenlik duvarı', 'Güncel anti-virüs sistemi', 'Sızma testi', 'Kişisel veri işleme envanteri hazırlanması'],
    correct: 'D',
  },
  {
    text: 'Aşağıdaki durumlardan hangisinde KVKK hükümleri uygulanmaz?',
    options: [
      'Bir şirketin müşteri bilgilerini kaydetmesi',
      'Bir kişinin, üçüncü kişilere vermeden yalnızca kendisi ve aynı evde yaşayan aile fertleriyle ilgili verileri işlemesi',
      'Bir hastanenin hasta kayıtlarını tutması',
      'Bir işverenin çalışan özlük dosyalarını tutması',
    ],
    correct: 'B',
  },
  {
    text: 'Aşağıdakilerden hangisi aydınlatma metninde bulunması gereken bilgilerden biridir?',
    options: ['Veri sorumlusunun kimliği', 'Şirketin yıllık cirosu', 'Çalışanların maaş bilgileri', 'Şirket ortaklarının özgeçmişi'],
    correct: 'A',
  },
  {
    text: 'Kanuna aykırı olarak kişisel verileri silmeyen veya anonim hâle getirmeyenler hangi maddeye göre cezalandırılır?',
    options: [
      '5237 sayılı Türk Ceza Kanunu 138. madde',
      '6698 sayılı Kanun 10. madde',
      '4857 sayılı İş Kanunu 25. madde',
      '6098 sayılı Türk Borçlar Kanunu 49. madde',
    ],
    correct: 'A',
  },
];

/** Görsel için okuma süresine eklenen saniye. */
const IMAGE_SECONDS = 10;
/** Dikkatli okuma hızı (kelime/dakika); mevzuat metni olduğu için ortalamanın altında tutuldu. */
const WORDS_PER_MINUTE = 150;

/**
 * Konunun en kısa okuma süresi: kelime sayısı / 150 kelime-dakika + görsel için 10 sn,
 * 30 saniyeye yukarı yuvarlanır, en az 60 saniye.
 */
export function readSeconds(content: string): number {
  const words = content
    .replace(/\{\{gorsel\}\}/g, ' ')
    .replace(/[#>*_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const raw = (words / WORDS_PER_MINUTE) * 60 + IMAGE_SECONDS;
  return Math.max(60, Math.ceil(raw / 30) * 30);
}
