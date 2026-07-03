import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import vendorRoutes from './routes/vendors.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Vowflo API', version: '2.0.0' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`🚀 Vowflo API running on http://localhost:${PORT}`);
});
