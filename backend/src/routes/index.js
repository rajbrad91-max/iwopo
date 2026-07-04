import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

router.get('/hello', (req, res) => {
  res.json({ message: 'Hello from Vowflo API! 👋' });
});

// Public: list all services (legacy)
router.get('/services', async (req, res) => {
  const { rows } = await query('SELECT * FROM services ORDER BY id');
  res.json({ services: rows });
});

// Public: packages (3 tiers) with their items nested
router.get('/packages', async (req, res) => {
  try {
    const { rows: packages } = await query(
      'SELECT * FROM packages ORDER BY sort_order'
    );
    const { rows: items } = await query(
      'SELECT * FROM package_items ORDER BY package_id, sort_order'
    );
    const result = packages.map(p => ({
      ...p,
      included: items.filter(i => i.package_id === p.id && i.is_included),
      addons: items.filter(i => i.package_id === p.id && i.is_addon),
      standalone: items.filter(
        i => i.package_id === p.id && !i.is_included && !i.is_addon
      ),
    }));
    res.json({ packages: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
