export function PortalContent() {
  return (
    <>
      <p>
        Çalıştığınız kuruluş ("Şirket") olarak, veri sorumlusu sıfatıyla, KVKK eğitimlerinin ve politika bilgilendirmelerinin çevrim içi
        yapılması için kullandığımız eğitim portalında kişisel verilerinizi aşağıdaki şekilde işliyoruz.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Veri</th>
              <th>Amaç</th>
              <th>Hukuki sebep</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ad soyad, departman, görev</td>
              <td>Eğitimlerin size atanması</td>
              <td>KVKK m.5/2-(ç) hukuki yükümlülük (KVKK m.12 kapsamında personel eğitimi), (c) iş sözleşmesinin ifası</td>
            </tr>
            <tr>
              <td>Cep telefonu</td>
              <td>Portala giriş kodunun SMS ile gönderilmesi</td>
              <td>(c) iş sözleşmesinin ifası</td>
            </tr>
            <tr>
              <td>E-posta adresi</td>
              <td>Eğitim atama ve hatırlatma bildirimleri</td>
              <td>(c) iş sözleşmesinin ifası</td>
            </tr>
            <tr>
              <td>Eğitim katılımı, sınav sonuçları, sertifikalar, doküman okuma onayları</td>
              <td>Eğitim yükümlülüğünün yerine getirildiğinin ispatı</td>
              <td>(ç) hukuki yükümlülük, (f) meşru menfaat</td>
            </tr>
            <tr>
              <td>Giriş kayıtları, IP adresi</td>
              <td>Portal güvenliği</td>
              <td>(f) meşru menfaat</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Verileriniz insan kaynakları kayıtlarımızdan aktarılarak ve portalı kullandıkça elektronik ortamda toplanır. Portal hizmetini veren
        Erdal Oğuzhan veri işleyen olarak verilerinizi yalnızca bizim adımıza ve Türkiye'deki sunucularda işler; SMS gönderimi için Verimor
        Telekomünikasyon A.Ş. kullanılır. Verileriniz yurt dışına aktarılmaz. Eğitime erişim ve katılım kayıtları 5 yıl, ayrıntılı sınav
        kayıtları (cevaplar) 2 yıl saklanır.
      </p>
      <p>KVKK m.11'deki haklarınız için çalıştığınız kuruluşa, kuruluşunuzun bildirdiği adres ve e-posta üzerinden başvurabilirsiniz.</p>
    </>
  );
}
