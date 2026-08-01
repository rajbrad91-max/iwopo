#!/bin/bash
# Nightly backup of both iwopo databases and the uploaded files.
#
# Written because there were none at all: no cron job, no timer, and no full
# dump had ever been taken. A bad query or a dropped table would have ended the
# business, and staging lost a table's contents this week for reasons nobody
# established.
#
# Local copies protect against the likely failure — a mistake in the data. They
# do NOT protect against losing the server itself; that needs an off-site copy.
set -euo pipefail

DEST=/var/backups/iwopo
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

for db in iwopo iwopo_staging; do
  f="$DEST/$db-$STAMP.sql.gz"
  sudo -u postgres pg_dump --clean --if-exists -d "$db" | gzip -9 > "$f"
  # a dump that can't be read back is not a backup — check it before trusting it
  if ! gzip -t "$f" 2>/dev/null; then
    echo "$(date -Is) CORRUPT DUMP $f" >> "$DEST/backup.log"; exit 1
  fi
  size=$(stat -c%s "$f")
  if [ "$size" -lt 2000 ]; then
    echo "$(date -Is) SUSPICIOUSLY SMALL $f ($size bytes)" >> "$DEST/backup.log"; exit 1
  fi
  echo "$(date -Is) ok $db $(numfmt --to=iec $size)" >> "$DEST/backup.log"
done

# the uploaded files — galleries, logos, website photos. Nothing regenerates these.
tar -czf "$DEST/storage-$STAMP.tar.gz" \
  -C /var/www/iwopo storage 2>/dev/null || true
echo "$(date -Is) ok storage $(numfmt --to=iec $(stat -c%s "$DEST/storage-$STAMP.tar.gz"))" >> "$DEST/backup.log"

# keep two weeks; older copies are rarely the ones you want and cost disk
find "$DEST" -name '*.gz' -mtime +$KEEP_DAYS -delete
echo "$(date -Is) pruned, $(ls "$DEST"/*.gz 2>/dev/null | wc -l) files held" >> "$DEST/backup.log"
