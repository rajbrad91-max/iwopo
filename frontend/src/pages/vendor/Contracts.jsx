/**
 * 📄 Contracts & Invoices: every contract and invoice, and the template tab.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect } from 'react';
import { api, fmtDateTime, fmtMoney } from '../../lib/api';
import { ContractSetup } from './ContractSetup';

export function ContractsTab() {
  const [sub, setSub] = useState('list'); // list | setup | invoices
  /* ✏️ "Edit this contract" on a lead's contract preview opens here with ?lead=<id>: the editor, for that client only */
  const ownFor = Number(new URLSearchParams(window.location.search).get('lead')) || null;
  const btn = (k, label) => (
    <button className={`refresh ct-tab ${sub === k ? 'is-on' : ''}`} onClick={() => setSub(k)}>{label}</button>
  );
  if (ownFor) return <div className="ct-wrap"><ContractSetup leadId={ownFor} /></div>;
  return (
    <div className="ct-wrap">
      <div className="ct-tabs">
        {btn('list', '📄 Contracts')}
        {btn('setup', '🛠️ Contract setup')}
        {btn('invoices', '🧾 Invoices')}
      </div>
      {sub === 'list' ? <AllContracts /> : sub === 'setup' ? <ContractSetup /> : <AllInvoices />}
    </div>
  );
}

function AllInvoices() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.allInvoices().then(d => setList(d.invoices || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Loading…</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan="6" className="empty">No invoices yet. Generate one from a lead 🧾</td></tr>
          ) : list.map(i => (
            <tr key={i.id}>
              <td className="biz">{i.invoice_number}</td>
              <td>{i.client_name}</td>
              <td>{fmtMoney(i.total, { decimals: 2 })}</td>
              <td className="ct-paid">{fmtMoney(i.paid, { decimals: 2 })}</td>
              <td className={Number(i.balance) > 0 ? 'ct-due' : 'ct-paid'}>{fmtMoney(i.balance, { decimals: 2 })}</td>
              {/* Opens the invoice the client sees. Copying the link was one step
                  short of useful — you still had to open it to check it was the
                  right one, and the address bar gives you the link anyway. */}
              <td>
                <a className="ct-link" href={`/invoice/${i.token}`} target="_blank" rel="noreferrer">🧾 View Invoice</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllContracts() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const S = { draft: '📝', sent: '📨', signed: '✅', void: '🚫' };
  useEffect(() => {
    api.allContracts().then(d => setList(d.contracts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Loading…</div>;
  // A contract belongs here once it is signed AND the booking is confirmed.
  // Anything earlier is still being negotiated and is worked on from the lead;
  // voided ones never leave the API at all.
  const shown = list.filter(c => c.status === 'signed');   // R2: every signed contract, booked or still awaiting payment
  return (
    <>
      {/* Above the table, not under it: it explains how these documents behave,
          which is worth knowing before reading the rows rather than after.
          It used to promise deletion after a year — nothing deletes anything,
          so it said something the software doesn't do. */}
      <p className="ct-retention">
        🗄️ Signed contracts and invoices stay here and stay downloadable.
        Keep your own copy of anything you may need later — download it from the row.
      </p>
      <div className="table-wrap">
        <table className="ct-table">
        <thead><tr><th className="ct-num">#</th><th>Client</th><th>Contract</th><th>Signed by</th><th className="ct-date">Signed</th><th>Booking</th><th>Documents</th></tr></thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan="7" className="empty">
              No signed contracts yet. A contract appears here as soon as the client signs it ✍️
            </td></tr>
          ) : shown.map((c, n) => (
            <tr key={c.id}>
              <td className="ct-num">{n + 1}</td>
              <td className="biz">{c.client_name}</td>
              <td className="ct-title">{c.title}</td>
              <td className={`ct-signer${(c.signed_name || '').trim().toLowerCase() === String(c.lead_name || c.client_name || c.lead?.name || '').trim().toLowerCase() ? ' is-same' : ''}`}>{c.signed_name || '—'}</td>
              <td className="ct-date">{c.signed_at ? fmtDateTime(c.signed_at, { dateOnly: true }) : '—'}</td>
              {/* F7: booked, or signed and still waiting for the deposit */}
              <td className="ct-booking">{c.lead_status === 'booked' ? '✅ Booked' : '⏳ Awaiting payment'}</td>
              {/* Both open in a tab rather than landing on disk: saving a file
                  before you have looked at it is a guess. Each document carries
                  its own Save as PDF button once it's open. */}
              <td className="ct-dl">
                <a href={`/api/contracts/download/${c.token}`} target="_blank" rel="noreferrer" className="ct-dl-btn">📄 Contract</a>
                <a href={`/api/contracts/certificate/${c.token}/download`} target="_blank" rel="noreferrer" className="ct-dl-btn">📜 Certificate</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
