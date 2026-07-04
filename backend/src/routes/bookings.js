import express from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { moneySummary } from './payments.js';

const router = express.Router();

function vid(req) {
  if (req.user.role === 'super_admin') return req.query.vendor_id || req.body.vendor_id || null;
  return req.user.vendor_id;
}

// GET /api/bookings → booked leads (calendar-ready)
router.get('/', requireAuth, async (req, res) => {
  const v = vid(req);
  try {
    const { rows } = v
      ? await query(`SELECT * FROM leads WHERE vendor_id=$1 AND status='booked' ORDER BY event_date NULLS LAST`, [v])
      : await query(`SELECT * FROM leads WHERE status='booked' ORDER BY event_date NULLS LAST`);
    const bookings = [];
    for (const l of rows) bookings.push({ ...l, money: await moneySummary(l) });
    res.json({ bookings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/bookings/:leadId/status → new | contacted | quoted | booked | completed | cancelled
const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'completed', 'cancelled'];
router.put('/:leadId/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const { rows: own } = await query('SELECT vendor_id FROM leads WHERE id=$1', [req.params.leadId]);
    if (!own[0]) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && own[0].vendor_id !== vid(req))
      return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `UPDATE leads SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [status, req.params.leadId]);
    res.json({ lead: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
