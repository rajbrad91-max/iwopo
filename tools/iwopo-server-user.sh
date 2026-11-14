#!/bin/bash
# 👤 The unprivileged user iwopo runs as (audit 2026-11-14). Safe to run again: it only fixes what is missing.
#   iwopo-server-user.sh staging|live
# What it sets up, and why:
#   • user `iwopo` (no login shell, home /var/lib/iwopo) — the apps run as this user, never as root
#   • the site's storage folder and .env belong to it (the .env stays unreadable to everyone else)
#   • camera FTP: vsftpd writes uploads as `ftp`; iwopo joins the `ftp` group and the FTP root is group-writable with
#     setgid, so iwopo can make each photographer's folder and file away what the camera sends — no root needed
#   • the FTP logins file lives in a folder only iwopo can write (/etc/vsftpd/iwopo-users), read by vsftpd's PAM
#   • the shared upload scratch folders in /tmp belong to it
#   • the PDF browser lives in /opt/ms-playwright, not in root's home
set -euo pipefail
case ${1:-} in staging) DIR=/var/www/iwopo-staging ;; live) DIR=/var/www/iwopo ;; *) echo "usage: $0 staging|live"; exit 1 ;; esac

id iwopo >/dev/null 2>&1 || useradd --system --home-dir /var/lib/iwopo --create-home --shell /usr/sbin/nologin iwopo
usermod -aG ftp iwopo

install -d -o iwopo -g iwopo -m 755 "$DIR/storage"
chown -R iwopo:iwopo "$DIR/storage"
chown root:iwopo "$DIR/backend/.env" && chmod 640 "$DIR/backend/.env"

install -d -o root -g ftp -m 2775 /srv/iwopo-ftp
find /srv/iwopo-ftp -mindepth 1 -type d -exec chmod g+ws {} +
find /srv/iwopo-ftp -mindepth 1 -exec chgrp ftp {} +
sed -i 's/^local_umask=.*/local_umask=002/' /etc/vsftpd.conf

install -d -o iwopo -g iwopo -m 700 /etc/vsftpd/iwopo-users
if [ -f /etc/vsftpd/iwopo.passwd ] && [ ! -f /etc/vsftpd/iwopo-users/iwopo.passwd ]; then mv /etc/vsftpd/iwopo.passwd /etc/vsftpd/iwopo-users/iwopo.passwd; fi
touch /etc/vsftpd/iwopo-users/iwopo.passwd && chown iwopo:iwopo /etc/vsftpd/iwopo-users/iwopo.passwd && chmod 600 /etc/vsftpd/iwopo-users/iwopo.passwd
sed -i 's#pwdfile=/etc/vsftpd/iwopo.passwd#pwdfile=/etc/vsftpd/iwopo-users/iwopo.passwd#' /etc/pam.d/vsftpd-iwopo
systemctl restart vsftpd

for t in iwopo_files vf_uploads iwopo-proc iwopo-fetch iwopo-selfie; do install -d -o iwopo -g iwopo -m 755 "/tmp/$t"; chown -R iwopo:iwopo "/tmp/$t"; done

# the headless browser that renders signed-contract PDFs (lib/pdf.js): one shared copy any user can run,
# named by PLAYWRIGHT_BROWSERS_PATH in tools/pm2.iwopo.config.cjs; iwopo-deploy keeps it matched to playwright-core
install -d -m 755 /opt/ms-playwright
(cd "$DIR/backend" && PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright npx --no-install playwright-core install chromium-headless-shell >/dev/null)
chmod -R a+rX /opt/ms-playwright
echo "✅ $1 ready for the iwopo user"
