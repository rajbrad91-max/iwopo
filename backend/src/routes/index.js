import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

router.get('/hello', (req, res) => {
  res.json({ message: 'Hello from Vowflo API! 👋' });
});

// Public: list all services (for Selling Platform)
router.get('/services', async (req, res) => {
  const { rows } = await query('SELECT * FROM services ORDER BY id');
  res.json({ services: rows });
});

export default router;
