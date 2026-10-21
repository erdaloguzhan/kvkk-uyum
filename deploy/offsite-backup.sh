#!/usr/bin/env bash
# Günlük veritabanı yedeklerini şifreleyip sunucu dışına (başka bir sunucu veya nesne depolama) kopyalar.
# Her gün OFFSITE_HOUR saatinde (İstanbul) /backups içindeki, henüz gönderilmemiş kvkk-*.dump dosyaları
# OFFSITE_PASSPHRASE ile şifrelenir (GPG, AES-256) ve rclone ile "offsite:" hedefine yüklenir. Hedefte
# OFFSITE_KEEP_DAYS günden eski kopyalar silinir. Başarılı her turdan sonra OFFSITE_PING_URL çağrılır;
# ping gelmezse izleme servisi (ör. healthchecks.io) uyarı gönderir. Ayrıntılar: docs/FELAKET-KURTARMA.md
set -euo pipefail
umask 077

: "${OFFSITE_PASSPHRASE:?OFFSITE_PASSPHRASE tanımlı olmalı}"
: "${OFFSITE_PATH:=kvkk-yedekler}"
: "${OFFSITE_HOUR:=4}"
: "${OFFSITE_KEEP_DAYS:=30}"
SENT_LIST=/backups/.offsite-gonderilenler
# En yeni yerel yedek bu kadar saatten eskiyse günlük yedekleme çalışmıyor demektir.
MAX_BACKUP_AGE_HOURS=26

log() { echo "$(date -Is) $*"; }

ping_monitor() {
  [ -n "${OFFSITE_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 "${OFFSITE_PING_URL}$1" >/dev/null || log "UYARI: izleme adresine ulaşılamadı"
}

run_once() {
  touch "$SENT_LIST"
  local newest
  newest=$(find /backups -maxdepth 1 -name 'kvkk-*.dump' -mmin -$((MAX_BACKUP_AGE_HOURS * 60)) | sort | tail -n 1)
  if [ -z "$newest" ]; then
    log "HATA: son ${MAX_BACKUP_AGE_HOURS} saatte alınmış yerel yedek yok"
    return 1
  fi

  local file name enc failed=0
  for file in $(find /backups -maxdepth 1 -name 'kvkk-*.dump' | sort); do
    name=$(basename "$file")
    grep -qxF "$name" "$SENT_LIST" && continue
    enc="/tmp/$name.gpg"
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 --output "$enc" "$file" 3<<<"$OFFSITE_PASSPHRASE"
    if rclone copyto --retries 5 "$enc" "offsite:$OFFSITE_PATH/$name.gpg" \
      && [ "$(rclone size --json "offsite:$OFFSITE_PATH/$name.gpg" | grep -o '"bytes":[0-9]*' | cut -d: -f2)" = "$(stat -c %s "$enc")" ]; then
      echo "$name" >>"$SENT_LIST"
      log "sunucu dışına kopyalandı: $name.gpg ($(du -h "$enc" | cut -f1))"
    else
      log "HATA: $name sunucu dışına kopyalanamadı"
      failed=1
    fi
    rm -f "$enc"
  done
  [ "$failed" = 0 ] || return 1

  rclone delete --min-age "${OFFSITE_KEEP_DAYS}d" --include 'kvkk-*.dump.gpg' "offsite:$OFFSITE_PATH" || log "UYARI: eski kopyalar silinemedi"
  # Yerelde silinmiş yedeklerin adları listeden çıkarılır.
  local keep
  keep=$(find /backups -maxdepth 1 -name 'kvkk-*.dump' -printf '%f\n' | sort)
  comm -12 <(sort "$SENT_LIST") <(echo "$keep") >"$SENT_LIST.tmp" && mv "$SENT_LIST.tmp" "$SENT_LIST"
  return 0
}

turn() {
  if run_once; then ping_monitor ""; else ping_monitor "/fail"; fi
}

if [ "${1:-}" = "now" ]; then
  run_once
  exit $?
fi

log "Sunucu dışı yedekleme başladı: her gün saat ${OFFSITE_HOUR}:30, hedefte ${OFFSITE_KEEP_DAYS} gün saklanır"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${OFFSITE_HOUR}:30" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${OFFSITE_HOUR}:30" +%s)
  sleep $((next - now))
  turn
done
