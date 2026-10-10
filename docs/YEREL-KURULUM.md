# Sistemi kendi bilgisayarınızda çalıştırma

Bu adımlarla KVK Yönetim Sistemi'nin tamamı (veritabanı, sunucu ve web arayüzü) bilgisayarınızda çalışır. Programlama bilgisi gerekmez; yalnızca bir kez **Docker Desktop** kurmanız gerekir.

> Bu kurulum yalnızca denemek içindir. Girdiğiniz bilgiler yalnızca kendi bilgisayarınızda kalır; gerçek e-posta gönderilmez.

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

Sistemin iki ekranı var: **Yönetim paneli** (siz, platform yöneticisi olarak kuruluş eklersiniz ve doküman şablonlarını güncellersiniz) ve **müşteri ekranı** (kuruluşların yetkilileri KVKK işlerini yürütür). Müşteriler kendileri hesap açamaz; kuruluşları yönetim panelinden siz eklersiniz.

### Yönetici olarak ilk giriş

1. Yeni bir sekmede **http://localhost:8025** adresini açın. Bu, yerel deneme için gönderilen e-postaları gösteren bir kutudur.
2. **admin@kvkk.local** adresine gelen "KVK Yönetim Sistemi yönetici hesabınız" e-postasını açın ve içindeki bağlantıya tıklayın.
3. Açılan sayfada şifrenizi oluşturun (en az 10 karakter, harf ve rakam içermeli).
4. **http://localhost:3000** adresinde `admin@kvkk.local` ve şifrenizle giriş yapın. Sistem 6 haneli bir **doğrulama kodu** gönderir; kodu yine http://localhost:8025 adresinde görürsünüz.
5. Yönetim paneli açılır.

> Kendi e-posta adresinizi yönetici yapmak isterseniz: `docker-compose.yml` dosyasının bulunduğu klasörde `.env` adında bir dosya oluşturun ve içine `PLATFORM_ADMIN_EMAILS=sizin@adresiniz.com` yazın, sonra `docker compose up --build` ile yeniden başlatın. Bu adresle daha önce hesap açtıysanız hesabınız yönetici olur.

### Kuruluş ekleme

1. Yönetim panelinde **Kuruluşlar → + Yeni kuruluş**'a tıklayın, bilgileri girin. **E-posta** alanındaki adres kuruluş yetkilisinin kullanıcı adı olur.
2. **Kuruluşu ekle ve davet gönder** deyin. Bu adrese şifre oluşturma bağlantısı gider (şifre e-postayla gönderilmez).
3. Yetkili bağlantıya tıklayıp şifresini oluşturur ve müşteri ekranına girer. Bağlantı 7 gün geçerlidir; süresi dolarsa listede **Daveti yeniden gönder**'e tıklayın.

### Doküman şablonlarını güncelleme

1. **Doküman şablonları**'nda bir şablonu açın, yayındaki sürümü indirip Word'de düzenleyin.
2. **Yeni sürüm yükle** ile taslak olarak ekleyin, sonra **Yayınla**'ya tıklayıp yayın tarihini seçin (bugün seçilirse hemen yayına girer).
3. O tarihten sonra kuruluşların oluşturduğu dokümanlar yeni sürümden gelir. Kuruluşların mevcut dokümanları kendiliğinden değişmez; onlara "Yeni şablon" uyarısı ve **Yeni şablonla güncelle** düğmesi çıkar.

### Müşteri ekranı

Kuruluş yetkilisi giriş yaptıktan sonra **Özet** sayfasındaki başlangıç adımlarını izleyebilir:
   - **Dokümanlar:** "Hepsini oluştur" ile KVKK dokümanları kuruluş bilgilerinizle hazırlanır; indirip Word'de açabilir, yayınlayabilir veya onaya gönderebilirsiniz.
   - **Veri envanteri:** Adım adım yeni satır ekleyin veya TBL-010 Excel dosyanızı içe aktarın; Excel'e geri aktarabilirsiniz.
   - **Görevler:** Görev atayın, son tarih ve hatırlatma belirleyin.

Davet, şifre sıfırlama ve görev bildirimi e-postaları da http://localhost:8025 adresinde görünür.

Daha önce kendi açtığınız hesap ve kuruluş varsa korunur; o hesapla müşteri ekranını kullanmaya devam edebilirsiniz.

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
| Giriş kodu gelmiyor | http://localhost:8025 sayfasını yenileyin. Kod 10 dakika geçerlidir; süresi dolduysa giriş ekranında "Kodu yeniden gönder"e tıklayın. |
