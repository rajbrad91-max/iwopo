-- ⬡ iwopo Multi-Tenant Schema

-- VENDORS (tenants)
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  business_name VARCHAR(200) NOT NULL,
  plan VARCHAR(50) DEFAULT 'starter',
  status VARCHAR(50) DEFAULT 'trial',
  storage_mb INTEGER DEFAULT 0,
  country VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- USERS (everyone logs in here - super_admin + vendors)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'vendor',
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SERVICES (the 8 standalone services)
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(20),
  price INTEGER NOT NULL,
  is_addon BOOLEAN DEFAULT FALSE,
  requires_service_id INTEGER REFERENCES services(id)
);

-- VENDOR_SERVICES (which vendor bought which service)
CREATE TABLE IF NOT EXISTS vendor_services (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT TRUE,
  UNIQUE(vendor_id, service_id)
);

-- Index for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_users_vendor ON users(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_services_vendor ON vendor_services(vendor_id);
