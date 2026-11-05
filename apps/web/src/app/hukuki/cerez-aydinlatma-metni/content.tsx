import Link from 'next/link';

export function CerezContent() {
  return (
    <>
      <p>
        Erdal Oğuzhan olarak KVK Uyum Yönetim Sistemi'nde (kvkuyum.com.tr) yalnızca sistemin çalışması için zorunlu çerezleri
        ve tarayıcı depolamasını kullanıyoruz. Reklam, pazarlama, analiz veya üçüncü taraf çerezi kullanmıyoruz; bu nedenle çerez onayı
        istemiyoruz.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Tür</th>
              <th>Ne için</th>
              <th>Süre</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>kvkk_at</td>
              <td>Zorunlu çerez (birinci taraf)</td>
              <td>Oturumun açık olduğunu doğrular</td>
              <td>15 dakika</td>
            </tr>
            <tr>
              <td>kvkk_rt</td>
              <td>Zorunlu çerez (birinci taraf)</td>
              <td>Oturumun yeniden giriş yapmadan yenilenmesi</td>
              <td>30 gün veya çıkış yapılana kadar</td>
            </tr>
            <tr>
              <td>kvkk_tr</td>
              <td>Zorunlu çerez (birinci taraf)</td>
              <td>Eğitim portalı oturumu</td>
              <td>Oturum süresi kadar</td>
            </tr>
            <tr>
              <td>kvkk_kurulus, kvkk_rol</td>
              <td>Tarayıcı depolaması</td>
              <td>Seçtiğiniz kuruluşu ve rolü hatırlar</td>
              <td>Siz silene veya çıkış yapana kadar</td>
            </tr>
            <tr>
              <td>kvkk_envanter_gorunum</td>
              <td>Tarayıcı depolaması</td>
              <td>Envanter tablosunda seçtiğiniz görünümü hatırlar</td>
              <td>Siz silene kadar</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Oturum çerezleri yalnızca sunucu tarafından okunabilir (HttpOnly), yalnızca bu siteye gönderilir (SameSite=Strict) ve güvenli
        bağlantı (HTTPS) üzerinden iletilir.
      </p>
      <p>
        Bot koruması için giriş ve şifre sıfırlama sayfalarında tarayıcınız kısa bir hesaplama yapar. Bu işlem kendi sunucumuzda doğrulanır,
        çerez bırakmaz ve hiçbir veri dış servise gönderilmez.
      </p>
      <p>
        Çerezleri tarayıcınızın ayarlarından silebilir veya engelleyebilirsiniz; ancak zorunlu çerezler engellenirse Sisteme giriş
        yapılamaz. Bu çerezlerle işlenen veriler KVKK m.5/2-(c) ve (f) kapsamında işlenir. Ayrıntı ve haklarınız için{' '}
        <Link href="/hukuki/kullanici-aydinlatma-metni">Kullanıcı Aydınlatma Metni</Link>'ne bakınız.
      </p>
    </>
  );
}
