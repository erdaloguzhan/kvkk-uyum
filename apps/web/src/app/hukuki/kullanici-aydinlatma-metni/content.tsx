import Link from 'next/link';

export function KullaniciContent() {
  return (
    <>
      <p>
        <strong>Veri sorumlusu.</strong> Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi ve Aydınlatma
        Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, veri sorumlusu sıfatıyla Erdal Oğuzhan
        ("Şirket") tarafından hazırlanmıştır. Adres: Finanskent Mah. Şahinbey Cad. Sinpaş Palas 6. Blok No: 2 İç Kapı No: 8
        Ümraniye/İstanbul. Vergi Dairesi / VKN: Alemdağ / 6340073976. E-posta: <a href="mailto:info@kvkuyum.com.tr">info@kvkuyum.com.tr</a>.
        KEP: <a href="mailto:erdal.oguzhan@hs03.kep.tr">erdal.oguzhan@hs03.kep.tr</a>.
      </p>
      <p>
        Bu metin, KVK Uyum Yönetim Sistemi'ni ("Sistem") kuruluşu adına kullanan Sorumlu ve Yönetici hesap sahiplerini kapsar. Kuruluşunuzun
        Sisteme yüklediği çalışan, envanter, sözleşme ve doküman verileri bakımından Şirket veri işleyendir; bu veriler için veri sorumlusu
        kuruluşunuzdur ve aydınlatma kuruluşunuz tarafından yapılır.
      </p>
      <p>
        <strong>İşlenen kişisel veriler, amaçları ve hukuki sebepleri</strong>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Veri kategorisi</th>
              <th>Veriler</th>
              <th>Amaç</th>
              <th>Hukuki sebep (KVKK m.5/2)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Kimlik</td>
              <td>Ad soyad</td>
              <td>Hesabın oluşturulması ve kullanıcının tanınması</td>
              <td>(c) Sözleşmenin kurulması veya ifası</td>
            </tr>
            <tr>
              <td>İletişim</td>
              <td>E-posta adresi, cep telefonu</td>
              <td>Giriş doğrulama kodu, şifre sıfırlama, görev ve hatırlatma bildirimleri</td>
              <td>(c) Sözleşmenin ifası</td>
            </tr>
            <tr>
              <td>Müşteri işlem</td>
              <td>Kuruluş üyeliği ve rolü, destek talepleri ve ekleri</td>
              <td>Hizmetin sunulması, destek verilmesi</td>
              <td>(c) Sözleşmenin ifası</td>
            </tr>
            <tr>
              <td>İşlem güvenliği</td>
              <td>
                Şifre özeti (şifrenin kendisi saklanmaz), giriş denemeleri, IP adresi, tarayıcı bilgisi, oturum bilgileri, Sistemde yapılan
                işlemlerin kayıtları
              </td>
              <td>Hesap güvenliği, yetkisiz erişimin önlenmesi, işlemlerin ispatı</td>
              <td>(ç) Hukuki yükümlülük (KVKK m.12 veri güvenliği), (f) Meşru menfaat</td>
            </tr>
            <tr>
              <td>Finans</td>
              <td>Fatura ve ödeme bilgileri (kuruluş yetkilisi için)</td>
              <td>Faturalandırma</td>
              <td>(ç) Hukuki yükümlülük (vergi mevzuatı), (c) Sözleşmenin ifası</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Toplama yöntemi.</strong> Ad, e-posta ve telefon bilgileri, hesabınızı açmak için kuruluşunuzun Şirkete bildirdiği
        bilgilerden; giriş, IP adresi ve işlem kayıtları ise Sistemi kullanırken elektronik ortamda otomatik olarak toplanır.
      </p>
      <p>
        <strong>Aktarım.</strong> Kişisel verileriniz yukarıdaki amaçlarla sınırlı olarak aşağıdaki alıcılara aktarılabilir. Verileriniz
        yurt dışına aktarılmaz.
      </p>
      <ul>
        <li>
          <p>Sunucu hizmeti alınan Çizgi Telekomünikasyon A.Ş. (sunucular Türkiye'de),</p>
        </li>
        <li>
          <p>Giriş kodu SMS'lerinin gönderimi için Verimor Telekomünikasyon A.Ş.</p>
        </li>
        <li>
          <p>E-posta gönderimi için Çizgi Telekomünikasyon A.Ş.</p>
        </li>
        <li>
          <p>Kuruluşunuz (üye olduğunuz kuruluşun yetkili kullanıcıları, işlem kayıtlarını görebilir),</p>
        </li>
        <li>
          <p>Talep halinde yetkili kamu kurum ve kuruluşları ile yargı mercileri.</p>
        </li>
      </ul>
      <p>
        <strong>Saklama süreleri.</strong> Hesap verileri, kuruluşunuzla hizmet sözleşmesi sürdükçe ve sona ermesinden sonra en fazla 1 ay;
        işlem ve giriş kayıtları kuruluşunuzun aboneliği sürdükçe ve sona ermesinden sonra en fazla 1 ay; fatura bilgileri vergi mevzuatının
        öngördüğü süre boyunca saklanır. Yedekler 14 gün sunucuda, şifreli kopyaları 14 gün sunucu dışında tutulur. Süre dolunca veriler
        silinir, yok edilir veya anonim hale getirilir.
      </p>
      <p>
        <strong>Haklarınız.</strong> KVKK'nın 11. maddesi uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep
        etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü
        kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, KVKK m.7'deki şartlar çerçevesinde silinmesini veya yok
        edilmesini isteme, düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle
        analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın
        giderilmesini talep etme haklarına sahipsiniz.
      </p>
      <p>
        <strong>Başvuru.</strong> Taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak,{' '}
        <Link href="/hukuki/basvuru-formu">İlgili Kişi Başvuru Formu</Link> ile yazılı olarak Finanskent Mah. Şahinbey Cad. Sinpaş Palas 6.
        Blok No: 2 İç Kapı No: 8 Ümraniye/İstanbul adresine, <a href="mailto:erdal.oguzhan@hs03.kep.tr">erdal.oguzhan@hs03.kep.tr</a> KEP
        adresine veya Sistemde kayıtlı e-posta adresinizden <a href="mailto:info@kvkuyum.com.tr">info@kvkuyum.com.tr</a> adresine
        iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi halinde Kurul'ca
        belirlenen tarifedeki ücret alınabilir. Başvurunuz reddedilir, cevabı yetersiz bulunur veya süresinde cevap verilmezse, KVKK m.14
        uyarınca Kişisel Verileri Koruma Kurulu'na şikayette bulunabilirsiniz.
      </p>
    </>
  );
}
