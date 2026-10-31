#!/bin/bash
# 🔑 Wildcard certificate for vendor subdomains (2026-10-31): *.iwopo.com (live) or *.alphabetaone.com (staging).
#
#   sudo bash scripts/wildcardCert.sh iwopo.com
#
# Needs the Hostinger API token in /etc/iwopo/hostinger.token (root only, 600). It (1) makes sure the wildcard DNS
# record "*.<domain> A <this server>" exists, (2) requests the certificate through the DNS hook. certbot's own timer
# renews it after that, using the same hook — nothing to do by hand ever again. Once the certificate exists, the
# domain provisioner installs the subdomain server block and switches vendor subdomains on.
set -euo pipefail
DOMAIN="${1:?usage: wildcardCert.sh <platform domain>}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,63}$ ]] || { echo "bad domain"; exit 1; }
TOKEN_FILE=/etc/iwopo/hostinger.token
[ -s "$TOKEN_FILE" ] || { echo "No Hostinger API token yet ($TOKEN_FILE). Vendor subdomains stay off."; exit 0; }
HERE="$(cd "$(dirname "$0")" && pwd)"
IP="$(curl -s -4 https://api.ipify.org || hostname -I | awk '{print $1}')"

# 1 · the wildcard record — added once, left alone after that
curl -sf -X PUT "https://developers.hostinger.com/api/dns/v1/zones/$DOMAIN" \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H 'Content-Type: application/json' \
  -d "{\"overwrite\":false,\"zone\":[{\"name\":\"*\",\"type\":\"A\",\"ttl\":3600,\"records\":[{\"content\":\"$IP\"}]}]}" >/dev/null \
  && echo "wildcard record *.$DOMAIN → $IP ✅" || echo "wildcard record: could not add (it may already exist)"

# 2 · the certificate
certbot certonly --manual --preferred-challenges dns \
  --manual-auth-hook "/usr/bin/node $HERE/hostingerDnsHook.mjs auth" \
  --manual-cleanup-hook "/usr/bin/node $HERE/hostingerDnsHook.mjs cleanup" \
  --cert-name "iwopo-wildcard-$DOMAIN" -d "*.$DOMAIN" \
  --non-interactive --agree-tos -m "${CERT_EMAIL:-sales@iwopo.com}" --keep-until-expiring
echo "certificate: /etc/letsencrypt/live/iwopo-wildcard-$DOMAIN ✅ — the provisioner switches subdomains on within 2 minutes"
