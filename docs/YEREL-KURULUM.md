# Sistemi kendi bilgisayarınızda çalıştırma

Bu adımlarla KVK Uyum Yönetim Sistemi'nin tamamı (veritabanı, sunucu ve web arayüzü) bilgisayarınızda çalışır. Programlama bilgisi gerekmez; yalnızca bir kez **Docker Desktop** kurmanız gerekir.

> Bu kurulum yalnızca denemek içindir. Girdiğiniz bilgiler yalnızca kendi bilgisayarınızda kalır; gerçek e-posta ve SMS gönderilmez.
> E-postalar http://localhost:8025 adresinde görünür. SMS ile gidecek kodlar (giriş kodu, Eğitim Portalı kodu) sistemi başlattığınız
> penceredeki yazıların arasında `SMS -> 05XX...: KVK Uyum giriş kodunuz: 123456` biçiminde görünür. Gerçek sunucu kurulumu:
> [CANLI-KURULUM.md](CANLI-KURULUM.md).

## 1. Docker Desktop'ı kurun (bir kez)

1. https://www.docker.com/products/docker-desktop/ adresinden işletim sisteminize uygun sürümü indirin (Windows veya Mac).
2. Kurun ve açın. Windows'ta kurulum "WSL 2" kurmak isterse kabul edin ve gerekirse bilgisayarı yeniden başlatın.
3. Docker Desktop açıkken sol altta yeşil **"Engine running"** yazısını görmelisiniz. Sistemi kullandığınız sürece Docker Desktop açık kalmalı.

## 2. Kodu indirin

1. https://github.com/erdaloguzhan/kvkk-uyum adresine gidin (GitHub hesabınızla girişli olmalısınız).
2. Yeşil **Code** düğmesine, sonra **Download ZIP**'e tıklayın.
3. İnen ZIP dosyasını bir klasöre çıkarın, örneğin `Belgeler/kvkk-uyum`.

> Web arayüzü ana sürüme (main) eklenmeden önce denemek isterseniz, sayfanın solundaki dal (branch) listesinden ilgili dalı seçip sonra **Download ZIP** deyin.

## 3. Sistemi başlatın

**Windows:** ZIP'i çıkardığınız klasörü açın (içinde `docker-compose.yml` dosyası olan klasör). Üstteki adres çubuğuna tıklayın, `powershell` yazıp Enter'a basın.

**Mac:** **Terminal** uygulamasını açın, `cd ` yazın (sonunda bir boşluk), klasörü Terminal penceresine sürükleyip bırakın ve Enter'a basın.

Açılan pencereye şunu yazıp Enter'a basın:

```
docker compose up --build
```

İlk seferde gerekli dosyalar indirildiği için **5–10 dakika** sürebilir. Ekranda `Nest application successfully started` ve `Ready` yazıları görününce sistem hazırdır. Bu pencereyi kapatmayın.

## 4. Kullanmaya başlayın

Sistemin üç ekranı var: **Yönetim paneli** (`/admin`; siz, platform yöneticisi olarak kuruluş eklersiniz, şablonları ve eğitimleri yönetirsiniz), **müşteri paneli** (kuruluşun KVKK Sorumlusu ve Yöneticisi KVKK işlerini yürütür) ve **Eğitim Portalı** (`/egitim`; çalışanlar dokümanları okur ve eğitim alır). Müşteriler kendileri hesap açamaz; kuruluşları ve kullanıcılarını yönetim panelinden siz eklersiniz.

### Yönetici olarak ilk giriş

1. Yeni bir sekmede **http://localhost:8025** adresini açın. Bu, yerel deneme için gönderilen e-postaları gösteren bir kutudur.
2. **admin@kvkk.local** adresine gelen "KVK Yönetim Sistemi yönetici hesabınız" e-postasını açın ve içindeki bağlantıya tıklayın.
3. Açılan sayfada şifrenizi oluşturun (en az 10 karakter, harf ve rakam içermeli).
4. **http://localhost:3000/admin** adresinde `admin@kvkk.local` ve şifrenizle giriş yapın. Sistem 6 haneli bir **doğrulama kodu** gönderir. Hesapta cep telefonu kayıtlı olmadığı için kod e-postayla gelir; yine http://localhost:8025 adresinde görürsünüz. (Telefonu kayıtlı hesaplarda kod SMS ile gider; yerelde pencere yazılarında görünür.)
5. Yönetim paneli açılır.

> Kendi e-posta adresinizi yönetici yapmak isterseniz: `docker-compose.yml` dosyasının bulunduğu klasörde `.env` adında bir dosya oluşturun ve içine `PLATFORM_ADMIN_EMAILS=sizin@adresiniz.com` yazın, sonra `docker compose up --build` ile yeniden başlatın. Bu adresle daha önce hesap açtıysanız hesabınız yönetici olur.

### Kuruluş ekleme

1. Yönetim panelinde **Kuruluşlar → + Yeni kuruluş**'a tıklayın, kuruluş bilgilerini girin. **E-posta** alanındaki adres KVKK Sorumlusunun kullanıcı adı olur.
2. Yöneticinin adını, e-postasını ve cep telefonunu girin. Sorumlu ve Yönetici aynı kişiyse "aynı kişi" kutusunu işaretleyin; hesap "KVKK Sorumlusu + Yönetici" olarak açılır.
3. **Kuruluşu ekle ve davet gönder** deyin. Her kişiye şifre oluşturma bağlantısı gider (şifre e-postayla gönderilmez); telefonu olan kişiye ayrıca bilgi SMS'i gider.
4. Kişi bağlantıya tıklayıp şifresini oluşturur ve müşteri paneline girer. Bağlantı 7 gün geçerlidir; süresi dolarsa kuruluş sayfasında **Daveti yeniden gönder**'e tıklayın.
5. Kuruluş 30 gün deneme lisansıyla açılır. Kuruluş sayfasındaki **Lisans** ile bitiş tarihini girin; süresi dolan kuruluş salt okunur olur.

### Doküman şablonlarını güncelleme

1. **Doküman şablonları**'nda bir şablonu açın, yayındaki sürümü indirip Word'de düzenleyin.
2. **Yeni sürüm yükle** ile taslak olarak ekleyin, sonra **Yayınla**'ya tıklayıp yayın tarihini seçin (bugün seçilirse hemen yayına girer).
3. O tarihten sonra kuruluşların oluşturduğu dokümanlar yeni sürümden gelir. Kuruluşların mevcut dokümanları kendiliğinden değişmez; onlara "Yeni şablon" uyarısı ve **Yeni şablonla güncelle** düğmesi çıkar.

### Müşteri ekranı

KVKK Sorumlusu giriş yaptıktan sonra **Özet** sayfasındaki başlangıç adımlarını izleyebilir:
   - **Kuruluş Bilgileri:** Ünvan, adres, vergi no gibi bilgiler ve isteğe bağlı logo. Bu bilgiler dokümanlara yerleşir.
   - **KVK Dokümanları:** "Hepsini oluştur" ile KVKK dokümanları kuruluş bilgilerinizle hazırlanır; indirip Word'de düzenleyebilir, Yöneticinin onayına gönderebilirsiniz.
   - **Kişisel Veri Envanteri:** Adım adım yeni satır ekleyin veya TBL-010 Excel dosyanızı içe aktarın; değişiklikleri onaya gönderin.
   - **KVK Sözleşmeleri, Kişisel Veri İmha Yönetimi, Veri İhlalleri, İlgili Kişi Başvuruları:** Süreç kayıtları; imha planı ve ihlal formu Yöneticinin onayına gider.
   - **Görevler, Bildirimler, İşlem Kayıtları.**

Birden çok rolü olan hesap girişten sonra **Rol seçin** ekranına gelir. Davet, şifre sıfırlama ve görev bildirimi e-postaları da http://localhost:8025 adresinde görünür.

### Uzaktan eğitim

Yönetim panelinin sol menüsündeki **Uzaktan eğitim** bölümünü kullanın. Sıra şöyledir:

1. **Çalışanlar:** **Kuruluşlar** listesinde kuruluşun satırındaki **Çalışanlar**'a tıklayın. Çalışanları tek tek ekleyin veya **Boş şablonu indir** ile Excel şablonunu doldurup **Excel'den içe aktar** deyin. Eğitim gönderilecek çalışanın cep telefonu (05XXXXXXXXX) olmalı; Eğitim Portalına telefonla girilir.
2. **Eğitimciler:** Eğitimci ekleyin (unvan ve imza görseli sertifikada çıkar). Eğitimciye şifre oluşturma bağlantısı gider; eğitimci giriş yapınca Eğitimler, Eğitim Grupları, Görevler ve Bildirimler'i görür.
3. **Eğitimler:** **+ Yeni eğitim** ile eğitimi oluşturun. **Alt konular** sekmesinde ders anlatımlarını yazın (görsel ekleyebilir, sağda önizlemeyi görebilirsiniz) ve her konunun en az okuma süresini girin. **Ön test** ve **Son test** sekmelerinde soruları ekleyin; her testin puanları toplamı 100 olmalı. Sonra **Bilgiler ve yayın** sekmesinde **Yayına al** deyin.
4. **Eğitim grupları:** **+ Yeni grup**'ta kuruluşu, eğitimi ve eğitimciyi seçin, çalışanları işaretleyin, **Grubu oluştur** deyin. Grubun sayfasında **Eğitimi başlat**'a tıklayınca katılımcılara portal adresini içeren SMS ve (e-postası varsa) e-posta gider; telefonu olmayan çalışan atlanır ve bildirilir.
5. **Katılımcı:** **http://localhost:3000/egitim** adresindeki Eğitim Portalı'na cep telefonuyla girer; şifre yoktur, telefona gelen 5 dakikalık SMS kodunu yazar (yerelde pencere yazılarında görünür). Ön testi çözer, konuları okur ve son testi çözer.
6. **Sınav sonuçları:** Eğitim Grupları sayfasındaki **Sınav sonuçları** ile notları görün, tabloyu Excel'e aktarın; başarılı katılımcı için **Sertifika oluştur** PDF sertifika indirir.

## Hazır test verisi yükleme

Her şeyi elle girmeden denemek için sisteme uydurma bir test verisi yükleyebilirsiniz. Sistem çalışırken (`docker compose up` penceresi açıkken) aynı klasörde **ikinci bir** PowerShell / Terminal penceresi açıp şunu yazın:

```
docker compose exec api node dist/db/seed-test-data.js
```

Birkaç saniye içinde `Test verisi yüklendi` yazar. Komutu ikinci kez çalıştırırsanız hiçbir şey değişmez. Veri yalnızca bilgisayarınızdaki deneme veritabanına yazılır; silmek için `docker compose down -v` yeterlidir (sizin girdiğiniz diğer bilgiler de silinir).

Tüm test hesaplarının şifresi **Deneme12345**. Test hesaplarında cep telefonu kayıtlı olduğu için girişteki 6 haneli kod SMS ile "gider": kodu sistemi başlattığınız penceredeki `SMS -> 0532555090...` satırında görürsünüz (pencereyi kapattıysanız `docker compose logs api` yazın). Çalışanlar Eğitim Portalına telefonla girer, kod yine aynı yerde görünür.

| Hesap | Nereden girilir | Rol |
|---|---|---|
| sorumlu.a@test.local | http://localhost:3000 | Test Ticaret A.Ş. - KVKK Sorumlusu |
| yonetici.a@test.local | http://localhost:3000 | Test Ticaret A.Ş. - Yönetici (bir doküman onayını bekliyor) |
| tek.b@test.local | http://localhost:3000 | Örnek Danışmanlık Ltd. Şti. - KVKK Sorumlusu + Yönetici |
| egitimci@test.local | http://localhost:3000/admin | Eğitimci |
| Cep telefonu 05325550010 (Ayşe), 05325550011 (Mehmet), 05325550012 (Zeynep), 05325550013 (Can) | http://localhost:3000/egitim | Çalışan; "KVKK Temel Farkındalık Eğitimi (test)" atanmış |
| Cep telefonu 05325550014 (Elif), 05325550017 (Gül) | http://localhost:3000/egitim | Çalışan; yalnızca KVKK dokümanlarını görür |
| Cep telefonu 05325550016 (Deniz) | http://localhost:3000/egitim | İşten çıkmış çalışan; dokümanları göremez |

Test Ticaret A.Ş.'de ayrıca şunlar hazırdır: tüm dokümanlar (4'ü yayında, biri çalışanlardan gizli, biri Yönetici onayında), 6 envanter satırı (biri eksik), 5 sözleşme (biri 20 gün içinde bitiyor, birinin süresi geçmiş), örnek ilgili kişi başvuruları, görevler ve 8 çalışan (biri e-postasız, biri işten çıkmış). Yönetim paneline yine kendi platform yöneticisi hesabınızla girersiniz.

## Durdurma ve yeniden başlatma

- **Durdurmak:** Komutu çalıştırdığınız pencerede `Ctrl + C` tuşlarına basın.
- **Yeniden başlatmak:** Aynı klasörde yine `docker compose up` yazın. Girdiğiniz bilgiler korunur.
- **Yeni sürümü denemek:** Yeni ZIP'i indirip çıkarın ve o klasörde `docker compose up --build` yazın.
- **Tüm deneme verilerini silip sıfırdan başlamak:** `docker compose down -v`

## Sorun olursa

| Belirti | Çözüm |
|---|---|
| `docker: command not found` veya `Cannot connect to the Docker daemon` | Docker Desktop açık değil. Açın, "Engine running" yazısını bekleyin, komutu tekrar çalıştırın. |
| `port is already allocated` (3000, 5432 veya 8025) | Bilgisayarınızda bu portu kullanan başka bir program var. O programı kapatın veya bize yazın. |
| Tarayıcıda sayfa açılmıyor | Pencerede `Ready` yazısının çıkmasını bekleyin; ilk açılış birkaç dakika sürebilir. |
| Yönetici e-postası http://localhost:8025'te yok | Sistem ilk açıldığında bir kez gönderilir. Giriş ekranında **Şifremi unuttum**'a tıklayıp `admin@kvkk.local` yazın; yeni bağlantı gelir. |
| Giriş kodu gelmiyor | Ekranda "SMS ile gönderildi" yazıyorsa kod sistemi başlattığınız pencerede (`docker compose logs api`), "e-postanıza gönderildi" yazıyorsa http://localhost:8025 sayfasındadır. Kod 10 dakika geçerlidir; süresi dolduysa "Kodu yeniden gönder"e tıklayın. |
