/**
 * 📇 Find a saved contact the way a person would (Raj, 2026-10-23): Tornado said "no such contact" until he insisted.
 * Searches his saved contacts (Quo — which also holds his Google Contacts) and forgives what speech-to-text does to
 * names: first name only, part of a name, any word order, small spelling differences (Mina ↔ Meena, Gagan ↔ Gagandeep),
 * or digits of the number. Exact matches first; with none, the closest names come back marked as close.
 */
import { quoConfig } from './quo.js';
import { contactsByNumber } from './commsEnrich.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** edit distance (small words only) */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
/** how a name sounds — the spellings speech-to-text mixes up (common in Punjabi/Indian names):
    ee/i, oo/u, ph/f, an "h" after a consonant (th/t, dh/d, bh/b…), and doubled letters (Rimmi/Rimi) */
const sound = (w) => w.replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/ph/g, 'f').replace(/([bcdgkpst])h/g, '$1').replace(/(.)\1+/g, '$1');

/** how well one spoken word fits one word of a saved name: 3 same · 2 start of it or sounds the same · 1 nearly · 0 no */
function wordFit(q, n) {
  if (q === n) return 3;
  if (sound(q) === sound(n)) return 2;
  if (q.length >= 2 && n.startsWith(q)) return 2;
  const d = Math.min(distance(q, n), distance(sound(q), sound(n)));
  return (q.length >= 4 && d <= 1) || (q.length >= 6 && d <= 2) ? 1 : 0;
}

/** contacts = Map(last ten digits → { name }) · returns [{ name, phone, exact }] best first */
export function matchContacts(contacts, query, limit = 8) {
  const raw = String(query || '').trim();
  const digits = raw.replace(/\D/g, '');
  const byNumber = digits.length >= 4 && /^[\d\s()+.-]+$/.test(raw);
  const qWords = norm(raw).split(' ').filter(Boolean);
  const hits = [];
  for (const [k, c] of contacts) {
    if (byNumber) { if (k.includes(digits.slice(-10))) hits.push({ k, c, score: 10, exact: true }); continue; }
    const nWords = norm(c.name).split(' ').filter(Boolean);
    if (!nWords.length || !qWords.length) continue;
    let score = 0, exact = true;
    for (const q of qWords) { const best = Math.max(0, ...nWords.map(n => wordFit(q, n))); if (best < 2) exact = false; score += best; }
    if (score > 0) hits.push({ k, c, score, exact });
  }
  hits.sort((a, b) => (b.exact - a.exact) || (b.score - a.score));
  const exactOnes = hits.filter(h => h.exact);
  return (exactOnes.length ? exactOnes : hits).slice(0, limit)
    .map(h => ({ name: h.c.name, phone: `(${h.k.slice(0, 3)}) ${h.k.slice(3, 6)}-${h.k.slice(6)}`, exact: h.exact }));
}

/** the vendor's saved contacts that match what he said */
export async function savedContactMatches(v, query, limit = 8) {
  const cfg = await quoConfig(v);
  if (!cfg.key) return [];
  return matchContacts(await contactsByNumber(cfg.key), query, limit);
}
