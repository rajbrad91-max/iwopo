import { useState } from 'react';
import Selling from './pages/Selling';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VendorPanel from './pages/VendorPanel';
import InquiryForm from './pages/InquiryForm';
import SignContract from './pages/SignContract';
import InvoiceView from './pages/InvoiceView';
import { getUser } from './lib/api';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [showLogin, setShowLogin] = useState(false);

  // 🌐 Public inquiry route: /inquiry/:vendorId  (no login needed)
  const m = window.location.pathname.match(/^\/inquiry\/(\d+)/);
  if (m) return <InquiryForm vendorId={m[1]} />;

  // 📄 Public contract signing: /sign/:token
  const s = window.location.pathname.match(/^\/sign\/([a-f0-9]+)/);
  if (s) return <SignContract token={s[1]} />;

  // 🧾 Public invoice view: /invoice/:token
  const iv = window.location.pathname.match(/^\/invoice\/([a-f0-9]+)/);
  if (iv) return <InvoiceView token={iv[1]} />;

  if (user) {
    if (user.role === 'super_admin') return <Dashboard onLogout={() => setUser(null)} />;
    return <VendorPanel onLogout={() => setUser(null)} />;
  }

  if (showLogin) {
    return <Login onLogin={setUser} onBack={() => setShowLogin(false)} />;
  }
  return <Selling onSignup={setUser} onGoLogin={() => setShowLogin(true)} />;
}
