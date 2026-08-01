# Server tooling

These four scripts run the audit, the deploy and the nightly backup. They used
to live only in `/usr/local/bin`, which meant a fix to one of them existed on
that box and nowhere else — a guard could be improved and then lost with the
server.

They now live here, and `/usr/local/bin` holds symlinks pointing back:

    /usr/local/bin/iwopo-verify    -> /var/www/iwopo-staging/tools/iwopo-verify
    /usr/local/bin/iwopo-deploy    -> /var/www/iwopo-staging/tools/iwopo-deploy
    /usr/local/bin/iwopo-consumers -> /var/www/iwopo-staging/tools/iwopo-consumers
    /usr/local/bin/iwopo-backup.sh -> /var/www/iwopo-staging/tools/iwopo-backup.sh

So editing a file in this folder *is* editing the installed tool. There is no
copy step to forget, and no way for the two to drift apart.

They point at the **staging** checkout deliberately: that is where changes are
made, and live only ever pulls `main`. Editing a tool on live would be editing
a file that the next pull overwrites.

## What each one does

**`iwopo-verify`** — the audit `iwopo-deploy` runs before it will commit.
Build, lint, a diff-sanity check for a file that lost most of itself, dead and
duplicate CSS, and four guards: admin tokens leaking to a client page, a bare
brand gold ignoring the vendor's own colour, a native browser dialog, and a
clean boot.

**`iwopo-deploy <message-file>`** — refuses to commit if verify fails, then
commits, pushes staging, merges main, pulls on live, rebuilds, restarts and
reports parity. `--force-truncation "<reason>"` overrides the diff-sanity check
and records the reason in the commit, so skipping it leaves a trace.

**`iwopo-consumers <symbol>`** — every file that reads a field, class or
function. Run it before changing anything shared; it exists because changing a
format without checking first broke three renderers at once.

**`iwopo-backup.sh`** — both databases and storage, nightly at 03:17 via
`/etc/cron.d/iwopo-backup`, 14 days retained in `/var/backups/iwopo/`.

## Restoring on a fresh server

Copy these to `/usr/local/bin` (or symlink as above), `chmod +x`, and put the
cron entry back. The paths inside them assume `/var/www/iwopo` for live and
`/var/www/iwopo-staging` for staging.

## Changing a guard

Edit the file here and run it. Then check it still *fails* on the thing it is
meant to catch — inject the fault, confirm it is flagged, remove it. A guard
that quietly stops flagging is worse than no guard, because it reports zero and
everyone believes it.
