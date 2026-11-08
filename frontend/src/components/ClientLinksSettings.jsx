import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 🔗 Settings → Client page links (Raj, 2026-11-08): what the vendor's inquiry form and galleries offer around
 * them — the business name and the "Private gallery" label as links, up to two buttons, social icons and a contact
 * footer. Everything is optional; an empty field simply does not show (components/ClientLinks.jsx).
 */
const SOCIAL = [['instagram', 'Instagram', 'instagram.com/yourstudio'], ['facebook', 'Facebook', 'facebook.com/yourstudio'],
  ['youtube', 'YouTube', 'youtube.com/@yourstudio'], ['tiktok', 'TikTok', 'tiktok.com/@yourstudio'],
  ['pinterest', 'Pinterest', 'pinterest.com/yourstudio'], ['whatsapp', 'WhatsApp', 'your number, or a wa.me link']];

export default function ClientLinksSettings() {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.clientLinks().then(d => setF(d.links)).catch(e => setMsg('⚠️ ' + e.message)); }, []);
  if (!f) return <div className="table-wrap clk">{msg || 'Loading…'}</div>;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setMsg(''); };
  const field = (k, label, ph, type = 'text') => (
    <label className="clk-field" key={k}><span>{label}</span><input type={type} value={f[k]} onChange={set(k)} placeholder={ph} /></label>
  );
  async function save() {
    setBusy(true); setMsg('');
    try { setF((await api.saveClientLinks(f)).links); setMsg('✅ Saved — your inquiry form and galleries show it now'); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="table-wrap clk">
      <h2 className="clk-h">🔗 Client page links</h2>
      <p className="sub clk-sub">Links around your inquiry form and galleries, so clients can get back to your website and find you elsewhere. All optional — leave a field empty and it simply doesn't show.</p>
      <h3 className="clk-h3">Clickable names</h3>
      {field('title_url', 'Your business name links to', 'yourwebsite.com')}
      {field('private_url', '“Private gallery” label links to', 'yourwebsite.com/clients')}
      <h3 className="clk-h3">Buttons (top left, up to two)</h3>
      <div className="clk-pair">{field('button1_label', 'Button 1 name', 'Home')}{field('button1_url', 'Button 1 link', 'yourwebsite.com')}</div>
      <div className="clk-pair">{field('button2_label', 'Button 2 name', 'Portfolio')}{field('button2_url', 'Button 2 link', 'yourwebsite.com/portfolio')}</div>
      <h3 className="clk-h3">Social icons (top right and footer)</h3>
      <div className="clk-grid">{SOCIAL.map(([k, label, ph]) => field(k, label, ph))}</div>
      <h3 className="clk-h3">Footer contact</h3>
      <div className="clk-grid">{field('footer_phone', 'Phone', '778-555-0100', 'tel')}{field('footer_email', 'Email', 'hello@yourstudio.com', 'email')}</div>
      {field('footer_address', 'Address', 'City, Province')}
      <div className="clk-actions">
        <button type="button" className="refresh clk-save" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save links'}</button>
        {msg && <span className="clk-msg">{msg}</span>}
      </div>
    </div>
  );
}
