#!/usr/bin/env bash
# Her gün BACKUP_HOUR saatinde (İstanbul saati) pg_dump ile tam yedek alır: /backups/kvkk-YYYY-MM-DD-HHMM.dump
# BACKUP_KEEP_DAYS günden eski yedekleri siler. Geri yükleme: docs/CANLI-KURULUM.md "Yedekten geri yükleme".
set -euo pipefail
umask 077  # yedekler kişisel veri içerir; yalnızca sahibi okuyabilsin

take_backup() {
  local file="/backups/kvkk-$(date +%Y-%m-%d-%H%M).dump"
  if pg_dump --format=custom --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date -Is) yedek alındı: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "$(date -Is) HATA: yedek alınamadı" >&2
  fi
  find /backups -name 'kvkk-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -print -delete
}

if [ "${1:-}" = "now" ]; then
  take_backup
  exit 0
fi

echo "Yedekleme başladı: her gün saat ${BACKUP_HOUR}:00, ${BACKUP_KEEP_DAYS} gün saklanır"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)
  sleep $((next - now))
  take_backup
done
