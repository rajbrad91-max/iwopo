/**
 * 🔔 AI Agent pop-ups — Web Push to the vendor's own phone / PC.
 *
 * Raj, 2026-10-10: "it should give me pop-ups on the screen, and on the click
 * of the pop-up it should be ready to talk to me". Every bell notification
 * (new lead, missed call, text, photo selection…) is also pushed to the
 * devices the vendor switched pop-ups on for — only vendors with the private
 * 'agent' feature. Tapping one opens the AI Agent, ready to listen.
 *
 * The keys that sign the pushes (VAPID) are made once and kept in platform
 * settings; nothing here needs a third-party account.
 */
import webpush from 'web-push';
import prisma from '../config/prisma.js';
import { getSetting, setSetting } from './settings.js';
import { getFeatures } from './entitlements.js';

let ready = null;
/** The VAPID key pair — created on first use, then reused forever. */
export function vapid() {
  ready ??= (async () => {
    let pub = await getSetting('vapid_public_key', ''), priv = await getSetting('vapid_private_key', '');
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      await setSetting('vapid_public_key', pub);
      await setSetting('vapid_private_key', priv);
    }
    webpush.setVapidDetails(`mailto:${process.env.PLATFORM_EMAIL || 'support@iwopo.com'}`, pub, priv);
    return pub;
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/**
 * Push one notice to every device of the vendor. Never throws, never slows the
 * caller down — a push is a courtesy on top of the bell, not the record.
 */
export async function pushToVendor(vendorId, title, body, url = '/panel/agent?voice=1') {
  try {
    const v = Number(vendorId);
    const subs = await prisma.push_subscriptions.findMany({ where: { vendor_id: v } });
    if (!subs.length) return 0;
    const feats = new Set(await getFeatures(v));
    if (!feats.has('*') && !feats.has('agent')) return 0;       // 🔒 private feature
    await vapid();
    const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body || '').slice(0, 240), url });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        // 404 / 410: that browser threw the subscription away — forget it
        if (e.statusCode === 404 || e.statusCode === 410) await prisma.push_subscriptions.delete({ where: { id: s.id } }).catch(() => {});
      }
    }
    return sent;
  } catch (e) { console.error('[agent push]', e.message); return 0; }
}
