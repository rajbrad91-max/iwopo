#!/bin/bash
# 🔐 Limited database logins for the iwopo app (audit 2026-11-14).
# The app reads and writes rows; only migrations (run by iwopo-deploy) keep the owner login.
# Usage: iwopo-db-roles.sh staging|live      — idempotent: an existing role keeps its password.
set -euo pipefail
shopt -s inherit_errexit
ENVIRONMENT=$1
case $ENVIRONMENT in
  staging) DIR=/var/www/iwopo-staging/backend; MAIN_DB=iwopo_staging; PRIV_DB=perfectposes_staging; MAIN_ROLE=iwopo_staging_app; PRIV_ROLE=iwopo_private_staging_app ;;
  live)    DIR=/var/www/iwopo/backend;         MAIN_DB=iwopo;         PRIV_DB=perfectposes;         MAIN_ROLE=iwopo_app;         PRIV_ROLE=iwopo_private_app ;;
  *) echo "usage: $0 staging|live"; exit 1 ;;
esac
ENV=$DIR/.env
cp -p $ENV /root/env-backup-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)

psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 -q "$@"; }

make_role() {   # role db → prints the role's URL
  local role=$1 db=$2 pass
  if [ "$(sudo -u postgres psql -Atc "select 1 from pg_roles where rolname='$role'")" = "1" ]; then
    pass=$(grep -oP "(?<=postgresql://$role:)[^@]+" $ENV | head -1 || true)
    [ -n "$pass" ] || { echo "role $role exists but its password is not in $ENV" >&2; exit 1; }
  else
    pass=$(openssl rand -hex 24)
    psql_su -c "CREATE ROLE $role LOGIN PASSWORD '$pass' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"
  fi
  psql_su -c "GRANT CONNECT ON DATABASE $db TO $role;"
  psql_su -d $db -c "
    GRANT USAGE ON SCHEMA public TO $role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $role;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO $role;"
  echo "postgresql://$role:$pass@localhost:5432/$db?schema=public"
}

OWNER_MAIN=$(grep -E '^DATABASE_URL=' $ENV | grep 'postgresql://postgres:' | cut -d= -f2- | tr -d '"' || true)
OWNER_PRIV=$(grep -E '^PRIVATE_DATABASE_URL=' $ENV | grep 'postgresql://postgres:' | cut -d= -f2- | tr -d '"' || true)
[ -n "$OWNER_MAIN" ] || OWNER_MAIN=$(grep -E '^MIGRATE_DATABASE_URL=' $ENV | cut -d= -f2- | tr -d '"')
[ -n "$OWNER_PRIV" ] || OWNER_PRIV=$(grep -E '^PRIVATE_MIGRATE_DATABASE_URL=' $ENV | cut -d= -f2- | tr -d '"')

APP_MAIN=$(make_role $MAIN_ROLE $MAIN_DB)
APP_PRIV=$(make_role $PRIV_ROLE $PRIV_DB)
for u in "$APP_MAIN" "$APP_PRIV" "$OWNER_MAIN" "$OWNER_PRIV"; do
  [[ $u == postgresql://*@localhost:5432/* ]] || { echo "a database address came out wrong — .env left unchanged" >&2; exit 1; }
done

# rewrite the database lines: the app gets the limited login, migrations the owner login; the unused DB_* lines go
grep -vE '^(DATABASE_URL|PRIVATE_DATABASE_URL|MIGRATE_DATABASE_URL|PRIVATE_MIGRATE_DATABASE_URL|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD)=' $ENV > $ENV.new
{
  echo "DATABASE_URL=\"$APP_MAIN\""
  echo "MIGRATE_DATABASE_URL=\"$OWNER_MAIN\""
  echo "PRIVATE_DATABASE_URL=\"$APP_PRIV\""
  echo "PRIVATE_MIGRATE_DATABASE_URL=\"$OWNER_PRIV\""
} >> $ENV.new
chmod 600 $ENV.new && mv $ENV.new $ENV
echo "$ENVIRONMENT: app → $MAIN_ROLE / $PRIV_ROLE · migrations → postgres"
grep -oE '^[A-Z_]+=' $ENV | tr '\n' ' '; echo
