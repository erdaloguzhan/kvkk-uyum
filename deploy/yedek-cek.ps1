# Sunucudaki şifreli yedekleri (yedekler/sifreli, sunucu dışı yedek servisi üretir) bu Windows bilgisayara indirir.
# Görev Zamanlayıcı ile her gün çalışır; yalnızca henüz inmemiş dosyaları indirir, $SaklaGun günden eskileri siler.
# Dosyalar OFFSITE_PASSPHRASE ile şifrelidir; parola olmadan açılamaz. Ayrıntılar: docs/FELAKET-KURTARMA.md
# SSH bağlantısı ~/.ssh/config içindeki "kvkk" kısayolunu kullanır (anahtarla, şifre sormadan girmeli).

$Hedef = 'C:\Users\erdal\Documents\KVKUyum-sunucu-yedek'          # OneDrive gibi bulutla eşitlenen bir klasör OLMAMALI
$Uzak = '/opt/kvkk/yedekler/sifreli'
$SaklaGun = 90
$PingUrl = ''                      # isteğe bağlı: healthchecks.io adresi; yedek inmezse e-posta gelir

New-Item -ItemType Directory -Force $Hedef | Out-Null
$Log = Join-Path $Hedef 'yedek-cek.log'
function Yaz($Mesaj) { "$(Get-Date -Format s) $Mesaj" | Add-Content -Encoding UTF8 $Log }

try {
  $Liste = ssh -o BatchMode=yes kvkk "ls $Uzak" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "sunucuya bağlanılamadı: $Liste" }
  $Yeni = 0
  foreach ($Dosya in $Liste) {
    if ($Dosya -notmatch '^kvkk-[0-9-]+\.dump\.gpg$') { continue }
    $Yerel = Join-Path $Hedef $Dosya
    if (Test-Path $Yerel) { continue }
    scp -q -p -o BatchMode=yes "kvkk:$Uzak/$Dosya" "$Yerel.part"
    if ($LASTEXITCODE -ne 0) {
      Remove-Item "$Yerel.part" -ErrorAction SilentlyContinue
      throw "$Dosya indirilemedi"
    }
    Move-Item "$Yerel.part" $Yerel
    $Yeni++
  }
  Get-ChildItem $Hedef -Filter 'kvkk-*.dump.gpg' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$SaklaGun) } |
    Remove-Item
  $EnYeni = Get-ChildItem $Hedef -Filter 'kvkk-*.dump.gpg' | Sort-Object LastWriteTime | Select-Object -Last 1
  if (-not $EnYeni -or $EnYeni.LastWriteTime -lt (Get-Date).AddHours(-50)) { throw 'son 2 günde alınmış yedek yok' }
  Yaz "tamam: $Yeni yeni yedek indirildi, en yenisi $($EnYeni.Name)"
  if ($PingUrl) { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 $PingUrl | Out-Null }
} catch {
  Yaz "HATA: $_"
  if ($PingUrl) { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$PingUrl/fail" -ErrorAction SilentlyContinue | Out-Null }
  exit 1
}
