import { useState } from 'react';
import Selling from './pages/Selling';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VendorPanel from './pages/VendorPanel';
import { getUser } from './lib/api';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [showLogin, setShowLogin] = useState(false);

  if (user) {
    if (user.role === 'super_admin') return <Dashboard onLogout={() => setUser(null)} />;
    return <VendorPanel onLogout={() => setUser(null)} />;
  }

  if (showLogin) {
    return <Login onLogin={setUser} onBack={() => setShowLogin(false)} />;
  }
  return <Selling onSignup={setUser} onGoLogin={() => setShowLogin(true)} />;
}
