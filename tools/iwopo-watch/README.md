# 📸 iwopo watch

Photographs upload themselves. Point it at a folder; anything that lands there
goes up. You do not open it, click it, or remember it.

## What it guarantees

It cannot be flawless — no software is, and a program claiming to be is lying
about the interesting cases. What it IS built to guarantee is that a photograph
is never **silently** lost. Every failure is written down, retried for ever, and
shown. The worst case is a photograph that has not gone up *yet* and says so.

Four things buy that, and the last matters most:

1. **It waits for a file to stop growing.** Lightroom writes a JPEG over several
   seconds; uploading at first sight ships half a photograph.
2. **A record on disk of what has gone.** A restart mid-wedding does not
   re-upload four hundred files.
3. **Retry with backoff, without limit.** A venue's wifi drops. That is a delay,
   never a loss.
4. **A full folder scan**, on startup and every minute. File-system events are
   missed — under load, on network drives, while the program restarts. The scan
   is what makes the promise true.

## Setting it up

1. **Get a device token.** In the panel: Settings → Devices → Add. It is shown
   once. It can only upload; it cannot read leads or delete anything, so a lost
   laptop is a nuisance rather than a disaster.

2. **Copy `config.example.json` to `config.json`** and fill it in:

   - `server` — `https://iwopo.com`
   - `token` — the device token
   - `albumId` — the live shoot's id, from the panel URL
   - `folder` — where Lightroom exports to, e.g. `C:\\Users\\you\\Pictures\\LiveShoot`

3. **Try it by hand first**, so you see it working:

   ```
   node iwopo-watch.js
   ```

   Drop a photograph in the folder. It should appear in the log within seconds.

4. **Make Windows start it at boot.** Task Scheduler → Create Task:

   - **General**: "Run whether user is logged on or not"
   - **Triggers**: New → *At startup*
   - **Actions**: Start a program → `node` → arguments `iwopo-watch.js` → start in the
     folder holding this file
   - **Settings**: tick *If the task fails, restart every 1 minute*

   Not the Startup folder: that only runs after somebody logs in, and a machine
   that reboots overnight would sit there doing nothing.

## Watching it

`watch.log`, beside this file, records everything with timestamps. `sent.json`
is the record of what has gone — deleting it makes the watcher re-upload the
folder, which is occasionally what you want and usually not.

## Re-exporting a photograph

Exporting over the same filename uploads it again, deliberately: a corrected
photograph should reach the client. The record matches on size and modification
time, not the name alone.
