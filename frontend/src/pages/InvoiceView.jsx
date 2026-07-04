import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function InvoiceView({ token }) {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.viewInvoice(token).then(d => setInv(d.invoice)).catch(e => setErr(e.message));
  }, [token]);

  if (err) return <div style={wrap}><div style={card}>⚠️ {err}</div></div>;
  if (!inv) return <div style={wrap}><div style={card}>Loading…</div></div>;

  const items = Array.isArray(inv.items) ? inv.items : [];
  const money = (v) => `$${Number(v || 0).toFixed(2)}`;

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: '#0f766e' }}>🧾 Invoice</h1>
            <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{inv.invoice_number}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <b>{inv.business_name}</b><br />
            {String(inv.created_at).slice(0, 10)}
          </div>
        </div>

        <div style={{ margin: '18px 0', fontSize: 14 }}>
          <b>Billed to:</b> {inv.client_name}<br />
          {inv.client_email}<br />
          {inv.event_type} {inv.event_date ? `· ${String(inv.event_date).slice(0, 10)}` : ''}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0f766e', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>Item</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '9px 4px' }}>{it.label}</td>
                <td style={{ padding: '9px 4px', textAlign: 'right' }}>{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14, marginLeft: 'auto', width: 240, fontSize: 14 }}>
          <Row l="Subtotal" v={money(inv.subtotal)} />
          {Number(inv.discount) > 0 && <Row l="Discount" v={`-${money(inv.discount)}`} />}
          <Row l="Total" v={money(inv.total)} bold />
          <Row l="Paid" v={money(inv.paid)} green />
          <Row l="Balance due" v={money(inv.balance)} bold amber={Number(inv.balance) > 0} />
        </div>

        {inv.notes && <div style={{ marginTop: 16, fontSize: 13, color: '#666' }}>📝 {inv.notes}</div>}

        <button onClick={() => window.print()}
          style={{ marginTop: 22, width: '100%', padding: 12, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          className="no-print">
          🖨️ Print / Save PDF
        </button>
        <style>{`@media print { .no-print { display: none } body { background: #fff } }`}</style>
      </div>
    </div>
  );
}

function Row({ l, v, bold, green, amber }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: bold ? 700 : 400, color: green ? '#059669' : amber ? '#b8860b' : '#222' }}>
      <span>{l}</span><span>{v}</span>
    </div>
  );
}

const wrap = { minHeight: '100vh', background: '#f4f7f6', display: 'flex', justifyContent: 'center', padding: 24, fontFamily: "'Segoe UI', sans-serif" };
const card = { background: '#fff', borderRadius: 14, padding: 30, width: '100%', boxShadow: '0 2px 14px rgba(0,0,0,0.07)', color: '#222', height: 'fit-content' };
