export function BasvuruContent() {
  return (
    <>
      <p>
        Bu form, platformun kendi kullanıcıları (Sorumlu, Yönetici) ve iletişim kurduğu kişiler içindir. Müşteri kuruluşların kendi ilgili
        kişileri, Sistemdeki başvuru modülünün kuruluşa özel başvuru sayfasını kullanır.
      </p>
      <p>
        Başvurularınızı, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca aşağıdaki yollardan biriyle iletebilirsiniz:
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Yöntem</th>
              <th>Adres</th>
              <th>Zarf / konu satırı</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>İslak imzalı olarak elden veya noter aracılığıyla</td>
              <td>Finanskent Mah. Şahinbey Cad. Sinpaş Palas 6. Blok No: 2 İç Kapı No: 8 Ümraniye/İstanbul</td>
              <td>"Kişisel Verilerin Korunması Kanunu Kapsamında Bilgi Talebi"</td>
            </tr>
            <tr>
              <td>Güvenli elektronik imzalı olarak KEP ile</td>
              <td>
                <a href="mailto:erdal.oguzhan@hs03.kep.tr">erdal.oguzhan@hs03.kep.tr</a>
              </td>
              <td>Aynı ifade</td>
            </tr>
            <tr>
              <td>Sistemde kayıtlı e-posta adresinizden</td>
              <td>
                <a href="mailto:info@kvkuyum.com.tr">info@kvkuyum.com.tr</a>
              </td>
              <td>Aynı ifade</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>1. Başvuru sahibinin bilgileri</strong>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alan</th>
              <th>Bilgi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ad soyad</td>
              <td></td>
            </tr>
            <tr>
              <td>T.C. kimlik no (yabancılar için uyruk ve pasaport/kimlik no)</td>
              <td></td>
            </tr>
            <tr>
              <td>Tebligata esas yerleşim yeri veya iş yeri adresi</td>
              <td></td>
            </tr>
            <tr>
              <td>E-posta</td>
              <td></td>
            </tr>
            <tr>
              <td>Telefon</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>2. Şirketle ilişkiniz</strong>
      </p>
      <p className="legal-check">☐ Sistem kullanıcısıyım (kuruluş adı: ...........)</p>
      <p className="legal-check">☐ Müşteri kuruluş yetkilisiyim</p>
      <p className="legal-check">☐ Destek veya satış yazışması yaptım</p>
      <p className="legal-check">☐ Diğer: ...........</p>
      <p>
        Not: Bir müşteri kuruluşun çalışanı olarak eğitim portalındaki verilerinizle ilgili talepleriniz için veri sorumlusu çalıştığınız
        kuruluştur; başvurunuzu ona yapınız. Bize gelirse kuruluşunuza iletiriz.
      </p>
      <p>
        <strong>3. Talebiniz</strong> (KVKK m.11)
      </p>
      <p className="legal-check">☐ Kişisel verilerimin işlenip işlenmediğini öğrenmek istiyorum</p>
      <p className="legal-check">☐ İşlenmişse bilgi talep ediyorum</p>
      <p className="legal-check">☐ İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek istiyorum</p>
      <p className="legal-check">☐ Aktarıldığı üçüncü kişileri öğrenmek istiyorum</p>
      <p className="legal-check">☐ Eksik veya yanlış işlenen verilerimin düzeltilmesini istiyorum</p>
      <p className="legal-check">☐ Verilerimin silinmesini veya yok edilmesini istiyorum</p>
      <p className="legal-check">☐ Düzeltme veya silmenin aktarılan üçüncü kişilere bildirilmesini istiyorum</p>
      <p className="legal-check">☐ Otomatik analiz sonucu aleyhime çıkan sonuca itiraz ediyorum</p>
      <p className="legal-check">☐ Kanuna aykırı işleme nedeniyle uğradığım zararın giderilmesini talep ediyorum</p>
      <p>Talebinizin ayrıntısı: ...........................................</p>
      <p>
        <strong>4. Yanıtın bildirilmesi</strong>
      </p>
      <p className="legal-check">☐ Adresime posta ile</p>
      <p className="legal-check">☐ E-posta adresime</p>
      <p className="legal-check">☐ Elden teslim (vekaleten ise noter onaylı vekaletname gereklidir)</p>
      <p>
        Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca maliyet gerektirmesi halinde Kurul tarifesindeki ücret
        alınabilir. Kimliğinizi doğrulamak için ek bilgi isteyebiliriz. Bu formda verdiğiniz bilgiler yalnızca başvurunuzun
        değerlendirilmesi ve yanıtlanması için KVKK m.5/2-(ç) kapsamında işlenir.
      </p>
      <p>Başvuru sahibi ad soyad / imza / tarih: ...........................</p>
    </>
  );
}
