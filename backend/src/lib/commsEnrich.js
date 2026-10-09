/**
 * 🎧 Filling a call in: its recording, summary and transcript, and the names
 * of the people in the timeline.
 *
 * Raj, 2026-10-09: "I'm not able to see the calls, the transcripts, the
 * summaries, the recordings." The call list Quo returns carries none of them;
 * each lives behind its own endpoint (see quo.js). This asks for them once a
 * call has finished, and again for an hour while any is still missing —
 * Quo writes the summary and transcript a few minutes AFTER the call, so the
 * first look often finds them not ready yet.
 *
 * Stored:
 *   body          the summary, as "• point" lines, then "Next steps:" if any
 *   transcript    JSON { v:1, lines:[{ t: seconds, us: true|false, text }] }
 *   recording_url "quo:<recordingId>" — a marker only. Quo's link expires,
 *                 so the actual audio is fetched fresh when somebody plays it
 *                 (GET /api/comms/:id/recording).
 */
import privateDb from '../config/privateDb.js';
import { getCall, getCallSummary, getCallTranscript, getCallRecordings, listContacts, ownNumbers, lastTen, otherParticipant } from './quo.js';

/** What enrichCall needs to know about a stored call. */
export const CALL_FIELDS = { id: true, external_id: true, duration_sec: true, direction: true, from_number: true, to_number: true };

const RETRY_FOR_MS = 60 * 60_000;     // keep looking for missing parts for an hour after the call
const RETRY_EVERY_MS = 5 * 60_000;    // …every five minutes
/* Calls per sweep. Each costs up to four paced requests (~0.7 s), so fifteen
   keeps one sweep — and a press of Sync now — to about ten seconds; a backlog
   simply drains over the next few minutes. */
const BATCH = 15;

function summaryText(s) {
  if (!s) return null;
  const points = (Array.isArray(s.summary) ? s.summary : [s.summary]).filter(Boolean);
  const next = (Array.isArray(s.nextSteps) ? s.nextSteps : [s.nextSteps]).filter(Boolean);
  if (!points.length && !next.length) return null;
  return [
    ...points.map(p => `• ${p}`),
    ...(next.length ? ['', 'Next steps:', ...next.map(p => `• ${p}`)] : []),
  ].join('\n');
}

function transcriptJson(t) {
  const lines = (t?.dialogue || [])
    .filter(d => d?.content)
    // a line spoken by someone on the vendor's team carries their Quo user id; the caller's does not
    .map(d => ({ t: Math.max(0, Math.round(Number(d.start) || 0)), us: !!d.userId, text: String(d.content) }));
  return lines.length ? JSON.stringify({ v: 1, lines }) : null;
}

/**
 * Fetch what Quo has for one stored call and write it onto the row.
 *
 * ⚠️ Only an ANSWER is final. A part Quo says it does not have (404) is
 * settled; a part that could not be fetched (rate limit, network) is not —
 * the call is left unmarked and the next sweep tries again. Marking it done
 * after a refused request left calls half-empty for good.
 */
export async function enrichCall(key, ev) {
  const ours = await ownNumbers(key);
  const stored = ev.direction === 'outgoing' ? ev.to_number : ev.from_number;
  const needNumber = !stored || ours.has(lastTen(stored));   // missing, or wrongly our own line
  const got = await Promise.allSettled([
    getCallSummary(key, ev.external_id),
    getCallTranscript(key, ev.external_id),
    getCallRecordings(key, ev.external_id),
    needNumber ? getCall(key, ev.external_id) : Promise.resolve(null),
  ]);
  const failed = got.find(g => g.status === 'rejected');
  if (failed) throw failed.reason;
  const [summary, transcript, recordings, callRow] = got.map(g => g.value);

  const rec = (recordings || []).find(r => r?.status === 'completed' && r?.id) || null;
  const data = { enriched_at: new Date() };
  const body = summaryText(summary);
  const tr = transcriptJson(transcript);
  if (body) data.body = body;
  if (tr) data.transcript = tr;
  if (rec) {
    data.recording_url = `quo:${rec.id}`;
    if (ev.duration_sec == null && Number.isFinite(Number(rec.duration))) data.duration_sec = Math.round(Number(rec.duration));
  }
  const otherNum = callRow && otherParticipant(callRow.participants, ours);
  if (otherNum) {
    data[ev.direction === 'outgoing' ? 'to_number' : 'from_number'] = otherNum.slice(0, 32);
    data[ev.direction === 'outgoing' ? 'from_number' : 'to_number'] = null;   // never our own number as "the other side"
  }
  await privateDb.comms_events.update({ where: { id: ev.id }, data });
  return !!(body || tr || rec);
}

/** Every finished call that has never been looked at, or is still missing a part within the hour. */
export async function enrichPending(cfg) {
  const now = Date.now();
  const calls = await privateDb.comms_events.findMany({
    where: {
      vendor_id: cfg.vendorId, kind: 'call',
      OR: [
        { enriched_at: null },                     // every call is looked at once — a missed one still needs its number
        {
          status: 'completed',
          occurred_at: { gt: new Date(now - RETRY_FOR_MS) },
          enriched_at: { lt: new Date(now - RETRY_EVERY_MS) },
          OR: [{ body: null }, { transcript: null }, { recording_url: null }],
        },
      ],
    },
    orderBy: { occurred_at: 'desc' },
    take: BATCH,
    select: CALL_FIELDS,
  });
  let filled = 0;
  for (const ev of calls) {
    try { if (await enrichCall(cfg.key, ev)) filled++; }
    catch (e) { console.error('[comms] could not fill call', ev.external_id, '—', e.message); }
  }
  return filled;
}

/* 📇 Contacts change rarely; asking Quo for every contact each minute would be
   waste. Refreshed every six hours, when the process starts, or straight
   after somebody saves a contact from iwopo (forgetContacts). */
let names = { at: 0, map: null };
const NAMES_EVERY_MS = 6 * 60 * 60_000;

/** Quo's contacts by number (last ten digits) → { id, name }, cached. */
export async function contactsByNumber(key) {
  if (!names.map || Date.now() - names.at > NAMES_EVERY_MS) {
    names = { at: Date.now(), map: await listContacts(key) };
  }
  return names.map;
}
export function forgetContacts() { names = { at: 0, map: null }; }

/** Put a name on every timeline row whose other party is a saved Quo contact. */
export async function fillContactNames(cfg) {
  const map = await contactsByNumber(cfg.key);
  if (!map.size) return 0;
  const ours = await ownNumbers(cfg.key);
  const rows = await privateDb.comms_events.findMany({
    where: { vendor_id: cfg.vendorId, contact_name: null },
    select: { id: true, direction: true, from_number: true, to_number: true },
    take: 500,
  });
  let named = 0;
  for (const r of rows) {
    const other = lastTen(r.direction === 'incoming' ? r.from_number : r.to_number);
    if (!other || ours.has(other)) continue;        // our own line is never "the other person"
    const name = map.get(other)?.name;
    if (!name) continue;
    await privateDb.comms_events.update({ where: { id: r.id }, data: { contact_name: name } });
    named++;
  }
  return named;
}
