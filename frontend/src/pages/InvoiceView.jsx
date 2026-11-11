import { useState, useEffect } from 'react';
import { api, fmtMoney } from '../lib/api';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import './invoiceView.css';

function issuedOn(iso, tz, pref) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const hour12 = pref !== '24h';
  try {
    return d.toLocaleString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12,
      timeZone: tz || 'UTC',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** 🧾 The client's invoice — its look lives in invoiceView.css (code audit #3, 2026-11-11). */
export default function InvoiceView({ token }) {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  useDocumentTitle(inv?.business_name);

  useEffect(() => {
    api.viewInvoice(token).then(d => setInv(d.invoice)).catch(e => setErr(e.message));
  }, [token]);

  if (err) return <div className="iv"><div className="iv-card">⚠️ {err}</div></div>;
  if (!inv) return <div className="iv"><div className="iv-card">Loading…</div></div>;

  const items = Array.isArray(inv.items) ? inv.items : [];
  // the vendor's currency, sent with the invoice — a client abroad should not
  // be shown dollars for a bill in pounds
  const money = (v) => fmtMoney(v, { decimals: 2, currency: inv.currency });

  return (
    <div className="iv">
      <div className="iv-card is-doc">
        <div className="iv-head">
          <div>
            <h1 className="iv-title">🧾 Invoice</h1>
            <div className="iv-number">{inv.invoice_number}</div>
          </div>
          <div className="iv-from">
            {/* the vendor's own mark — the client should see one business across
                the portal, the contract and this invoice */}
            {inv.logo_path && <img src={`/api/me/logo/${inv.logo_path}`} alt="" className="iv-logo" />}
            <b>{inv.business_name}</b><br />
            {issuedOn(inv.created_at, inv.timezone, inv.time_format)}
          </div>
        </div>

        <div className="iv-to">
          <b>Billed to:</b> {inv.client_name}<br />
          {inv.client_email}<br />
          {inv.event_type} {inv.event_date ? `· ${String(inv.event_date).slice(0, 10)}` : ''}
        </div>

        <table className="iv-items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="iv-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{it.label}</td>
                <td className="iv-amount">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="iv-totals">
          <Row l="Subtotal" v={money(inv.subtotal)} />
          {Number(inv.discount) > 0 && <Row l="Discount" v={`-${money(inv.discount)}`} />}
          <Row l="Total" v={money(inv.total)} bold />
          <Row l="Paid" v={money(inv.paid)} green />
          <Row l="Balance due" v={money(inv.balance)} bold amber={Number(inv.balance) > 0} />
        </div>

        {inv.notes && <div className="iv-notes">📝 {inv.notes}</div>}

        <button type="button" onClick={() => window.print()} className="iv-print">🖨️ Print / Save PDF</button>
      </div>
    </div>
  );
}

function Row({ l, v, bold, green, amber }) {
  const cls = ['iv-row', bold && 'is-bold', green ? 'is-green' : amber && 'is-amber'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span>{l}</span><span>{v}</span>
    </div>
  );
}
