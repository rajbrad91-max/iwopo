/** 🔐 Encrypt a vendor's connection secrets (AES-256-GCM). The key, INBOX_SECRET, lives only in the server's .env —
 *  the database alone can't open what is stored with it. */
import crypto from 'crypto';
export function secretKey() {
  const k = process.env.INBOX_SECRET || '';
  if (!/^[0-9a-f]{64}$/i.test(k)) throw new Error('inbox_key_missing');
  return Buffer.from(k, 'hex');
}
export function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}
export function unseal(s) {
  const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', secretKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
}
