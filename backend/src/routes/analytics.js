/**
 * 📊 Who visited, and who downloaded what.
 *
 * Reads site_events, which is written by recordEvent() at the seven places a
 * visit or a download actually happens.
 *
 * 🔒 Every query is scoped to the vendor on the token. This is a private
 * feature — services.is_private — so only somebody a super admin has granted it
 * can reach the route at all, but the tenancy scoping is here regardless: a
 * feature being rare is not a reason to trust it.
 */
import express from 'express';
import prisma from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const vid = (req) => Number(req.user?.vendor_id);

/** Days back, kept sane — a year is all that is retained anyway. */
function windowDays(q) {
  const d = Number(q?.days);
  return Number.isFinite(d) && d >= 1 && d <= 365 ? Math.floor(d) : 30;
}

/**
 * GET /api/analytics?days=30 → everything the page needs, in one call.
 *
 * One request rather than five, because five means five round trips and a page
 * that arrives in pieces.
 */
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  if (!v) return res.status(400).json({ error: 'No vendor' });

  try {
    const days = windowDays(req.query);
    const since = new Date(Date.now() - days * 864e5);
    const where = { vendor_id: v, created_at: { gte: since } };      // 🔒 tenancy

    const [byKind, byCountry, byDevice, recent, topTargets, referrers] = await Promise.all([
      prisma.site_events.groupBy({ by: ['kind'], where, _count: true }),
      prisma.site_events.groupBy({ by: ['country'], where, _count: true, orderBy: { _count: { country: 'desc' } }, take: 8 }),
      prisma.site_events.groupBy({ by: ['ua_kind'], where, _count: true }),
      prisma.site_events.findMany({
        where, orderBy: { id: 'desc' }, take: 40,
        select: { kind: true, label: true, country: true, ua_kind: true, referrer: true, created_at: true },
      }),
      /* What people actually opened or took — the question a vendor asks
         first, and the one a bare visit count never answers. */
      prisma.site_events.groupBy({
        by: ['kind', 'label'], where, _count: true,
        orderBy: { _count: { label: 'desc' } }, take: 12,
      }),
      prisma.site_events.groupBy({
        by: ['referrer'], where: { ...where, referrer: { not: null } },
        _count: true, orderBy: { _count: { referrer: 'desc' } }, take: 8,
      }),
    ]);

    /* A day-by-day series, built in JS rather than SQL so the empty days are
       present. A chart that skips a day with no visitors draws a straight line
       through it and says business was steady when it was silent. */
    const rows = await prisma.site_events.findMany({
      where, select: { created_at: true, kind: true }, orderBy: { created_at: 'asc' },
    });
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      daily.push({ date: key, views: 0, downloads: 0 });
    }
    const idx = Object.fromEntries(daily.map((d, i) => [d.date, i]));
    for (const r of rows) {
      const i = idx[r.created_at.toISOString().slice(0, 10)];
      if (i == null) continue;
      if (r.kind === 'site_view' || r.kind === 'gallery_open') daily[i].views++;
      else daily[i].downloads++;
    }

    const count = (k) => byKind.find(x => x.kind === k)?._count || 0;

    res.json({
      days,
      totals: {
        site_views: count('site_view'),
        gallery_opens: count('gallery_open'),
        photo_downloads: count('photo_download'),
        zip_downloads: count('zip_download'),
        file_downloads: count('file_download'),
      },
      daily,
      countries: byCountry.map(c => ({ country: c.country || '??', count: c._count })),
      devices: byDevice.map(d => ({ kind: d.ua_kind || 'unknown', count: d._count })),
      top: topTargets.map(t => ({ kind: t.kind, label: t.label, count: t._count })),
      referrers: referrers.map(r => ({ referrer: r.referrer, count: r._count })),
      recent: recent.map(r => ({ ...r, created_at: r.created_at })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
