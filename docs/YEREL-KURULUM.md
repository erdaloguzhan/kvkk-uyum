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

1. Tarayıcıda **http://localhost:3000** adresini açın.
2. **Hesap oluştur** ile kendinize bir hesap açın (şifre en az 10 karakter, harf ve rakam içermeli).
3. E-posta ve şifrenizle giriş yapın. Sistem 6 haneli bir **doğrulama kodu** gönderir.
4. Kodu görmek için yeni bir sekmede **http://localhost:8025** adresini açın. Bu, yerel deneme için gelen e-postaları gösteren bir kutudur. "KVK Yönetim Sistemi giriş kodu" e-postasındaki kodu giriş ekranına yazın.
5. İlk girişte kuruluş bilgilerinizi girin. Sonra **Özet** sayfasındaki başlangıç adımlarını izleyebilirsiniz:
   - **Dokümanlar:** "Hepsini oluştur" ile KVKK dokümanları kuruluş bilgilerinizle hazırlanır; indirip Word'de açabilir, yayınlayabilir veya onaya gönderebilirsiniz.
   - **Veri envanteri:** Adım adım yeni satır ekleyin veya TBL-010 Excel dosyanızı içe aktarın; Excel'e geri aktarabilirsiniz.
   - **Görevler:** Görev atayın, son tarih ve hatırlatma belirleyin.

Davet, şifre sıfırlama ve görev bildirimi e-postaları da http://localhost:8025 adresinde görünür.

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
| Giriş kodu gelmiyor | http://localhost:8025 sayfasını yenileyin. Kod 10 dakika geçerlidir; süresi dolduysa giriş ekranında "Kodu yeniden gönder"e tıklayın. |
