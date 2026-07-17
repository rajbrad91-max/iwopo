# Vowflo / iwopo — Deploy & Promote Guide

Two isolated environments live on this one server:

| | STAGING (test) | LIVE (production) |
|---|---|---|
| Domain | alphabetaone.com | iwopo.com |
| Code folder | /var/www/vowflo-staging | /var/www/vowflo |
| Git branch | `staging` | `main` |
| Backend (PM2) | vowflo-staging-api (port 3002) | vowflo-api (port 3001) |
| Database | vowflo_staging | vowflo |
| Storage | /var/www/vowflo-staging/storage | /var/www/vowflo/storage |

They share NOTHING. Break anything on staging; live is safe.

--------------------------------------------------------------------
## THE GOLDEN RULE
Test on STAGING first. Only promote to LIVE after it works on staging.
Never edit files directly in /var/www/vowflo (live). All changes start
in /var/www/vowflo-staging.
--------------------------------------------------------------------


## A. MAKE + TEST A CHANGE (on staging)

1. Claude edits files in /var/www/vowflo-staging (never live).

2. Rebuild whatever changed:
   - Frontend change:
       cd /var/www/vowflo-staging/frontend && npm run build && systemctl reload nginx
   - Backend change:
       pm2 restart vowflo-staging-api
   - Both:  do both of the above.

3. Test at https://alphabetaone.com until it's exactly right.

4. Commit the tested change on the staging branch:
       cd /var/www/vowflo-staging
       git add <files>
       git commit -m "clear message"
       git push origin staging


## B. PROMOTE STAGING -> LIVE (after it passes)

Once the change works on alphabetaone.com and is committed to `staging`:

1. Merge staging into main:
       cd /var/www/vowflo-staging
       git checkout main
       git merge staging
       git push origin main
       git checkout staging        # switch back so staging stays on its branch

2. Pull the change into the LIVE folder and rebuild:
       cd /var/www/vowflo
       git pull origin main
       # then rebuild what changed:
       #   frontend: cd frontend && npm run build && systemctl reload nginx
       #   backend:  pm2 restart vowflo-api

3. Verify https://iwopo.com works.

Done. Live now has exactly what you tested on staging.


## C. DATABASE CHANGES (schema: new tables/columns)

Code deploys don't carry DB changes — run the SQL on BOTH databases.

1. On staging first (test it):
       sudo -u postgres psql -d vowflo_staging -f /tmp/change.sql
2. After it's verified and you promote the code, run the SAME SQL on live:
       sudo -u postgres psql -d vowflo -f /tmp/change.sql

(Claude handles this — just know DB changes are a separate step from git.)


## D. RESET STAGING TO MATCH LIVE (fresh snapshot)

If staging data gets messy and you want to start clean from live's data:

    pm2 stop vowflo-staging-api
    sudo -u postgres dropdb vowflo_staging
    sudo -u postgres createdb vowflo_staging
    sudo -u postgres pg_dump vowflo | sudo -u postgres psql -d vowflo_staging -q
    pm2 start vowflo-staging-api

(Optional) copy live photos too:
    rm -rf /var/www/vowflo-staging/storage
    cp -r /var/www/vowflo/storage /var/www/vowflo-staging/storage


## QUICK REFERENCE

Rebuild staging frontend:  cd /var/www/vowflo-staging/frontend && npm run build && systemctl reload nginx
Rebuild live frontend:     cd /var/www/vowflo/frontend && npm run build && systemctl reload nginx
Restart staging backend:   pm2 restart vowflo-staging-api
Restart live backend:      pm2 restart vowflo-api
See both processes:        pm2 list
Staging logs:              pm2 logs vowflo-staging-api
Live logs:                 pm2 logs vowflo-api
