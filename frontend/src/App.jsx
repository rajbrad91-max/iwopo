import { useState, useEffect } from 'react';
import Selling from './pages/Selling';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VendorPanel from './pages/VendorPanel';
import InquiryForm from './pages/InquiryForm';
import SignContract from './pages/SignContract';
import InvoiceView from './pages/InvoiceView';
import Certificate from './pages/Certificate';
import ClientPortal from './pages/ClientPortal';
import CrewCheckin from './pages/CrewCheckin';
import PublicGallery from './pages/PublicGallery';
import VendorGallery from './pages/VendorGallery';
import Vote from './pages/Vote';
import KnowledgeFill from './pages/KnowledgeFill';
import ResetPassword from './pages/ResetPassword';
import { getUser, sessionMismatch, clearSession } from './lib/api';

export default function App() {
  // 🔑 If the stored user and the actual token disagree (e.g. logging into the
  // vendor panel overwrote a super-admin token in the same browser), the saved
  // user is stale — drop it so we show the login screen rather than admin
  // screens that would 403 on every request.
  const [user, setUser] = useState(() => {
    if (sessionMismatch()) { clearSession(); return null; }
    return getUser();
  });
  const [showLogin, setShowLogin] = useState(false);
  // re-render on Back/Forward so URL-driven routes (e.g. /panel ↔ /) stay in sync
  const [, forceUrlTick] = useState(0);
  useEffect(() => {
    const onPop = () => forceUrlTick(t => t + 1);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 🌐 Public inquiry route: /inquiry/:vendorId  (no login needed)
  const m = window.location.pathname.match(/^\/inquiry\/(\d+)/);
  if (m) return <InquiryForm vendorId={m[1]} />;

  // 🔑 Password reset: /reset-password?token=…
  if (window.location.pathname.match(/^\/reset-password\/?$/)) {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    return <ResetPassword token={token} />;
  }

  // 🗳️ Voting page: /vote
  if (window.location.pathname.match(/^\/vote\/?$/)) return <Vote />;

  // 📚 Chatbot knowledge fill-in: /knowledge/:token
  const kf = window.location.pathname.match(/^\/knowledge\/([a-f0-9]+)/i);
  if (kf) return <KnowledgeFill token={kf[1]} />;

  // 📄 Public contract signing: /sign/:token
  const s = window.location.pathname.match(/^\/sign\/([a-f0-9]+)/);
  if (s) return <SignContract token={s[1]} />;

  // 🧾 Public invoice view: /invoice/:token
  const iv = window.location.pathname.match(/^\/invoice\/([a-f0-9]+)/);
  if (iv) return <InvoiceView token={iv[1]} />;

  // 📜 Signing certificate: /certificate/:token
  const ce = window.location.pathname.match(/^\/certificate\/([a-f0-9]+)/);
  if (ce) return <Certificate token={ce[1]} />;

  // 🌐 Client portal: /portal/:token (pick package + balance)
  const po = window.location.pathname.match(/^\/portal\/([a-f0-9]+)/);
  if (po) return <ClientPortal token={po[1]} />;

  // 👷 Crew check-in: /checkin/:token
  const ck = window.location.pathname.match(/^\/checkin\/([a-f0-9]+)/);
  if (ck) return <CrewCheckin token={ck[1]} />;

  // 🖼️ Whole vendor gallery (all albums): /gallery/:token
  const vg = window.location.pathname.match(/^\/gallery\/([a-z0-9]+)/i);
  if (vg) return <VendorGallery token={vg[1]} />;

  // 🖼️ Public client gallery (single album): /g/:token
  const g = window.location.pathname.match(/^\/g\/([a-z0-9]+)/i);
  if (g) return <PublicGallery token={g[1]} />;


  if (user) {
    if (user.role === 'super_admin') return <Dashboard onLogout={() => setUser(null)} />;
    return <VendorPanel onLogout={() => setUser(null)} />;
  }

  if (showLogin) {
    return <Login onLogin={setUser} onBack={() => setShowLogin(false)} />;
  }
  return <Selling onSignup={setUser} onGoLogin={() => setShowLogin(true)} />;
}
