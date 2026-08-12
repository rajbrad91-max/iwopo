/**
 * ☁️ Object storage — Cloudflare R2, with the local disk as the floor.
 *
 * Two buckets, never one. Galleries and File Flyer files are reached by an album
 * password or a share token; site images and logos are deliberately world
 * readable. Putting both classes in one bucket would let anyone holding a file's
 * URL walk past both gates at once, so each class gets its own bucket AND its
 * own credential — a fault in the public path then cannot reach private objects
 * even in principle.
 *
 * ⚠️ Tenancy lives in the key. Every object is written under
 *   vendor/<vendor_id>/<prefix>/<name>
 * and the vendor_id must always come from the caller's token, never from a path
 * the client supplied. Object storage has no notion of who is asking — the
 * prefix IS the wall, and a key built from user input is a key that can be
 * walked sideways into another vendor's photographs.
 *
 * Nothing here throws when R2 is not configured. `enabled()` reports false and
 * every caller keeps using the disk, so the migration can land in pieces
 * instead of as one switch that has to be right first time.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
         HeadObjectCommand, ListObjectsV2Command, CreateMultipartUploadCommand,
         UploadPartCommand, CompleteMultipartUploadCommand,
         AbortMultipartUploadCommand, ListPartsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSetting } from './settings.js';
import path from 'node:path';

/** Which of the two classes an object belongs to. */
export const PRIVATE = 'private';
export const PUBLIC = 'public';

// Clients are cached per class. Building an S3Client is not free, and this is
// called on every read of every thumbnail on a page of four hundred.
const clients = new Map();
let configAt = 0;
let config = null;
const TTL_MS = 30_000;

async function loadConfig() {
  if (config && Date.now() - configAt < TTL_MS) return config;
  const [accountId, sharedKey, sharedSecret,
         bucketPrivate, privKey, privSecret,
         bucketPublic, pubKey, pubSecret, publicUrl] = await Promise.all([
    getSetting('r2_account_id', ''),
    getSetting('r2_access_key_id', ''),
    getSetting('r2_secret_access_key', ''),
    getSetting('r2_bucket_private', ''),
    getSetting('r2_private_access_key_id', ''),
    getSetting('r2_private_secret_access_key', ''),
    getSetting('r2_bucket_public', ''),
    getSetting('r2_public_access_key_id', ''),
    getSetting('r2_public_secret_access_key', ''),
    getSetting('r2_public_url', ''),
  ]);

  config = {
    accountId: (accountId || '').trim(),
    publicUrl: (publicUrl || '').trim().replace(/\/+$/, ''),
    [PRIVATE]: {
      bucket: (bucketPrivate || '').trim(),
      // a bucket with no key of its own falls back to the shared pair; that is
      // supported but not recommended, and the panel leaves it blank
      keyId: (privKey || sharedKey || '').trim(),
      secret: (privSecret || sharedSecret || '').trim(),
    },
    [PUBLIC]: {
      bucket: (bucketPublic || '').trim(),
      keyId: (pubKey || sharedKey || '').trim(),
      secret: (pubSecret || sharedSecret || '').trim(),
    },
  };
  configAt = Date.now();
  clients.clear();
  return config;
}

/** Forget the cached config — called when the super admin saves new settings. */
export function invalidate() {
  config = null;
  configAt = 0;
  clients.clear();
}

/**
 * Is this class of storage usable right now?
 *
 * Deliberately a question rather than an assumption. Every caller checks it and
 * falls back to the disk, which is what lets R2 be switched on for one prefix
 * at a time instead of all four at once.
 */
export async function enabled(cls = PRIVATE) {
  const c = await loadConfig();
  const s = c[cls];
  return Boolean(c.accountId && s?.bucket && s?.keyId && s?.secret);
}

async function clientFor(cls) {
  if (clients.has(cls)) return clients.get(cls);
  const c = await loadConfig();
  const s = c[cls];
  if (!c.accountId || !s.bucket || !s.keyId || !s.secret) {
    throw new Error(`R2 is not configured for the ${cls} bucket`);
  }
  const client = new S3Client({
    region: 'auto',                                   // R2 ignores region
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: s.keyId, secretAccessKey: s.secret },
  });
  clients.set(cls, { client, bucket: s.bucket });
  return clients.get(cls);
}

/**
 * 🔒 Build an object key, scoped to one vendor.
 *
 * The vendorId must come from the caller's token. `parts` are joined and then
 * stripped of anything that could climb out of the prefix — a name like
 * "../../3/private.jpg" would otherwise reach another vendor's folder, and
 * object storage would serve it without complaint.
 */
export function keyFor(vendorId, ...parts) {
  const v = Number(vendorId);
  if (!Number.isInteger(v) || v <= 0) throw new Error('keyFor needs a real vendor id');
  const tail = parts
    .filter(Boolean)
    .map(p => String(p).split('/').map(seg => path.basename(seg)).filter(s => s && s !== '.' && s !== '..').join('/'))
    .filter(Boolean)
    .join('/');
  if (!tail) throw new Error('keyFor needs a path');
  return `vendor/${v}/${tail}`;
}

export async function putObject(cls, key, body, contentType) {
  const { client, bucket } = await clientFor(cls);
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body,
    ...(contentType ? { ContentType: contentType } : {}),
  }));
  return key;
}

/**
 * Returns the object's body as a stream, NOT as a buffer.
 *
 * This matters more than it looks. File Flyer and gallery zips are streamed
 * through archiver and never staged to a temp file, because a multi-GB share
 * would otherwise need that much scratch space free and would stall before the
 * first byte reached the client. Reading into memory here would reintroduce
 * exactly that problem, one object at a time.
 */
export async function getStream(cls, key, range) {
  const { client, bucket } = await clientFor(cls);
  const out = await client.send(new GetObjectCommand({
    Bucket: bucket, Key: key,
    // A browser asking for part of a film is not an optimisation. Safari and iOS
    // send a Range request before they will play anything at all and refuse a
    // 200, and no player can seek without being able to ask for the middle.
    ...(range ? { Range: range } : {}),
  }));
  return {
    stream: out.Body,
    size: out.ContentLength,
    contentType: out.ContentType,
    // present only on a partial reply — e.g. "bytes 0-1048575/73400320"
    contentRange: out.ContentRange || null,
  };
}

export async function headObject(cls, key) {
  const { client, bucket } = await clientFor(cls);
  try {
    const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: out.ContentLength, contentType: out.ContentType, at: out.LastModified };
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
    throw e;
  }
}

/** Missing is not an error: deleting a file whose object never arrived is fine. */
export async function deleteObject(cls, key) {
  const { client, bucket } = await clientFor(cls);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/** Every key under a prefix, paged. Used by the migration and by the meter. */
export async function listAll(cls, prefix) {
  const { client, bucket } = await clientFor(cls);
  const keys = [];
  let token;
  do {
    const out = await client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix, ContinuationToken: token,
    }));
    for (const o of out.Contents || []) keys.push({ key: o.Key, size: o.Size });
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/* ══════════════════════════════════════════════════════════════════════
   ⬆️ Uploads that go straight from the browser to R2.

   A wedding film can be a hundred gigabytes. Sending that through this server
   fails three ways at once: R2 refuses a single PUT over 5GB, the file would
   have to land in /tmp and then move to storage — two hundred gigabytes of
   disk for one upload, on a box with a hundred and eighty free — and a single
   request lasting hours will drop long before it finishes.

   So the file never touches this server. The browser is handed a signed URL
   per part, sends each one to Cloudflare directly, and tells us when it is
   done. We only ever see the metadata.

   That also makes it resumable for nothing: a part that fails is fifty
   megabytes to retry rather than the whole film, and R2 remembers which parts
   have already landed.
   ══════════════════════════════════════════════════════════════════════ */

/** Signed URLs expire. Long enough for a slow part, short enough to matter. */
const PART_URL_TTL = 3600;

export async function beginMultipart(cls, key, contentType) {
  const { client, bucket } = await clientFor(cls);
  const out = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket, Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  }));
  return out.UploadId;
}

/**
 * A signed URL the browser may PUT one part to.
 *
 * The URL carries the bucket, the key and the part number, all signed — so a
 * caller cannot repoint it at another key by editing it, which is what keeps
 * this from becoming a way to write anywhere in the bucket.
 */
export async function signPart(cls, key, uploadId, partNumber) {
  const { client, bucket } = await clientFor(cls);
  return getSignedUrl(client, new UploadPartCommand({
    Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber,
  }), { expiresIn: PART_URL_TTL });
}

/** Which parts R2 already holds — this is what makes a resume possible. */
export async function listParts(cls, key, uploadId) {
  const { client, bucket } = await clientFor(cls);
  const parts = [];
  let marker;
  do {
    const out = await client.send(new ListPartsCommand({
      Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker,
    }));
    for (const p of out.Parts || []) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size });
    marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
  } while (marker);
  return parts;
}

/**
 * Stitch the parts into one object.
 *
 * The part list is read back from R2 rather than trusted from the browser: a
 * client that reported the wrong etags would produce a corrupt film, and a
 * client that reported fewer parts than it sent would produce a truncated one.
 */
export async function completeMultipart(cls, key, uploadId) {
  const { client, bucket } = await clientFor(cls);
  const parts = (await listParts(cls, key, uploadId))
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag }));
  if (!parts.length) throw new Error('No parts were uploaded');
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
  return { key, parts: parts.length };
}

/** Throw away a half-finished upload so its parts stop costing storage. */
export async function abortMultipart(cls, key, uploadId) {
  const { client, bucket } = await clientFor(cls);
  try { await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })); return true; }
  catch { return false; }
}

/**
 * The address a browser can fetch a public object from.
 *
 * Null until a custom domain is set. r2.dev is deliberately not used — it is
 * rate limited and Cloudflare marks custom domains as the production path — so
 * until the domain exists, public objects keep being served through nginx.
 */
export async function publicUrlFor(key) {
  const c = await loadConfig();
  return c.publicUrl ? `${c.publicUrl}/${key}` : null;
}
