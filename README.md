# ⬡ Vowflo — Multi-Tenant SaaS

## 📁 Structure
```
vowflo/
├── backend/    → Node + Express + PostgreSQL
└── frontend/   → React + Vite
```

## 🚀 Backend Setup

1. Install PostgreSQL, create a database called `vowflo`
2. Copy env: `cp .env.example .env` → edit DB password + JWT_SECRET
3. Install: `npm install`
4. Setup tables + seed: `npm run db:setup`
5. Run: `npm run dev` → http://localhost:3001

## 🔑 Default Login
- Email: `raj@vowflo.com`
- Password: `changeme123` (⚠️ change after first login)

## 🔒 Multi-Tenancy
- Every vendor = a tenant with `vendor_id`
- `tenant.js` middleware locks vendors to their own data
- Vendors can NEVER see other vendors' data
- Super admin sees everything

## 🔌 Key Endpoints
- `POST /api/auth/login` → get token
- `POST /api/auth/signup` → new vendor (public)
- `GET /api/vendors/me/services` → own services (vendor)
- `GET /api/vendors` → all vendors (super admin only)
- `POST /api/vendors/:id/services/:sid/toggle` → toggle service (super admin)

## ⚠️ Security (verify before launch)
A vendor must NEVER change their own vendor_id or role.
Paid security audit required.
