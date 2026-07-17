import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function setup() {
  console.log('🗄️  Setting up database...');

  // 1. Create tables
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✅ Tables created');

  // 2. Seed 8 services
  const services = [
    ['Galleries', '📸', 29, false, null],
    ['Leads & Bookings', '📋', 39, false, null],
    ['Contracts', '📄', 19, false, null],
    ['Calendar', '📅', 15, true, 2],   // add-on, needs Leads & Bookings (id 2)
    ['Cloud Storage', '☁️', 25, false, null],
    ['Crew Management', '👥', 22, false, null],
    ['AI Chatbot', '🤖', 35, false, null],
    ['Analytics', '📈', 18, false, null]
  ];
  for (const [name, icon, price, addon, req] of services) {
    await pool.query(
      `INSERT INTO services (name, icon, price, is_addon, requires_service_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [name, icon, price, addon, req]
    );
  }
  console.log('✅ 8 services seeded');

  // 3. Create super admin (you)
  const hash = await bcrypt.hash('changeme123', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, vendor_id)
     VALUES ($1,$2,$3,'super_admin',NULL) ON CONFLICT (email) DO NOTHING`,
    ['Raj', 'raj@iwopo.com', hash]
  );
  console.log('✅ Super admin created (raj@iwopo.com / changeme123)');

  console.log('🎉 Database ready!');
  await pool.end();
}

setup().catch(err => { console.error('❌', err); process.exit(1); });
