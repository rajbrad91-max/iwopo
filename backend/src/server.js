import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import vendorRoutes from './routes/vendors.js';
import leadRoutes from './routes/leads.js';
import meRoutes from './routes/me.js';
import vendorPackageRoutes from './routes/vendorPackages.js';
import paymentRoutes from './routes/payments.js';
import bookingRoutes from './routes/bookings.js';
import inquirySettingsRoutes from './routes/inquirySettings.js';
import emailRoutes from './routes/email.js';
import contractRoutes from './routes/contracts.js';
import invoiceRoutes from './routes/invoices.js';
import crewRoutes from './routes/crew.js';
import albumRoutes from './routes/albums.js';
import galleryPublicRoutes from './routes/galleryPublic.js';
import pollRoutes from './routes/poll.js';
import chatbotRoutes from './routes/chatbot.js';
import notificationRoutes from './routes/notifications.js';
import portalRoutes from './routes/portal.js';
import { gate } from './lib/entitlements.js';

dotenv.config();

const app = express();
app.set('trust proxy', true); // 🌍 real client IP behind nginx (for geo pricing)
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/leads', gate('leads'), leadRoutes);
app.use('/api/me', meRoutes);
app.use('/api/vendor-packages', vendorPackageRoutes);
app.use('/api/payments', gate('leads'), paymentRoutes);
app.use('/api/bookings', gate('leads'), bookingRoutes);
app.use('/api/inquiry-settings', gate('leads'), inquirySettingsRoutes);
app.use('/api/email', gate('leads'), emailRoutes);
app.use('/api/contracts', gate('contracts'), contractRoutes);
app.use('/api/invoices', gate('contracts'), invoiceRoutes);
app.use('/api/crew', gate('crew'), crewRoutes);
app.use('/api/albums', gate('galleries'), albumRoutes);
app.use('/api/g', galleryPublicRoutes); // 🌐 public client gallery (no auth/gate)
app.use('/api/poll', pollRoutes); // 🗳️ public voting page (one vote per IP)
app.use('/api/chatbot', chatbotRoutes); // 🤖 Tasveer chatbot: subscribers + knowledge base
app.use('/api/notifications', notificationRoutes);
app.use('/api/portal', portalRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Vowflo API', version: '2.0.0' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`🚀 Vowflo API running on http://localhost:${PORT}`);
});
