/**
 * 💾 Off-site copy of the nightly backups (2026-11-04).
 *
 * /usr/local/bin/iwopo-backup.sh dumps both databases and the uploaded files to /var/backups/iwopo — on this
 * server, so they protect against a mistake in the data but not against losing the server itself. This sends
 * that night's files to the PRIVATE R2 bucket (Cloudflare — a different company from the server's) under
 * _backups/<YYYY-MM-DD>/, checks each copy's size, and removes copies there older than KEEP_DAYS.
 *
 * _backups/ sits outside every vendor/<id>/ prefix, so no vendor's storage meter counts it and no cleanup job
 * (orphan sweep, raw-file sweep, ledger reconcile — all scoped to vendor/) can touch it.
 *
 *   node scripts/offsiteBackup.mjs <file>...        exit 1 if any copy fails (the backup log shows it)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as objects from '../src/lib/objectStore.js';
import prisma from '../src/config/prisma.js';

const PREFIX = '_backups/';
const KEEP_DAYS = 30;
const DAY_MS = 864e5;

async function main(files) {
  if (!files.length) throw new Error('no files given');
  if (!(await objects.enabled(objects.PRIVATE))) throw new Error('R2 private storage is not configured');
  const day = new Date().toISOString().slice(0, 10);

  for (const f of files) {
    const size = fs.statSync(f).size;
    const key = `${PREFIX}${day}/${path.basename(f)}`;
    await objects.putObject(objects.PRIVATE, key, fs.createReadStream(f), 'application/gzip', size);
    const back = await objects.headObject(objects.PRIVATE, key);
    if (!back || Number(back.size) !== size) throw new Error(`copy of ${path.basename(f)} did not arrive whole`);
    console.log(`ok ${key} ${size}`);
  }

  const cutoff = Date.now() - KEEP_DAYS * DAY_MS;
  const old = (await objects.listAll(objects.PRIVATE, PREFIX)).filter(o => new Date(o.at).getTime() < cutoff);
  for (const o of old) await objects.deleteObject(objects.PRIVATE, o.key);
  console.log(`pruned ${old.length} copies older than ${KEEP_DAYS} days`);
}

main(process.argv.slice(2))
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(`offsite backup failed: ${e.message}`); await prisma.$disconnect(); process.exit(1); });
