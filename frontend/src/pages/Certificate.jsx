import { useState, useEffect } from 'react';
import './certificate.css';

/**
 * Certificate of electronic signature.
 *
 * This is the document produced when a signature is challenged, so it is set
 * like a legal record rather than part of the app: serif type, ruled rows, no
 * ornament and no emoji. Every time is printed in UTC and says so — a record
 * that reads differently depending on who opens it proves nothing.
 */
export default function Certificate({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/contracts/certificate/${token}`)
      .then(r => r.json())
      .then(d => d.error ? setErr(d.error) : setData(d))
      .catch(() => setErr('Failed to load'));
  }, [token]);

  if (err) return <div className="cert-page"><div className="cert-sheet cert-state">{err}</div></div>;
  if (!data) return <div className="cert-page"><div className="cert-sheet cert-state">Loading…</div></div>;

  const c = data.certificate;
  const fmt = (d) => {
    if (!d) return '—';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return String(d);
    return x.toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'UTC',
    }) + ' UTC';
  };
  const EV = {
    created: 'Document created',
    sent: 'Sent to signer',
    viewed: 'Opened by signer',
    signed: 'Signed',
    finalized: 'Finalised',
    voided: 'Voided',
    package_changed: 'Package changed',
  };
  const rows = [
    ['Document', c.title],
    ['Issued by', c.business_name],
    ['Signatory', `${c.signed_name}${c.client_email ? ` (${c.client_email})` : ''}`],
    ['Matter', `${c.event_type || '—'}${c.event_date ? ` — ${String(c.event_date).slice(0, 10)}` : ''}`],
    ['Created', fmt(c.created_at)],
    ['First opened', fmt(c.viewed_at)],
    ['Executed', fmt(c.signed_at)],
    ['Originating IP', c.signed_ip || '—'],
    ['Initials captured', `${(c.initials || []).filter(Boolean).length}`],
  ];

  return (
    <div className="cert-page">
      <div className="cert-sheet">
        <header className="cert-head">
          {c.logo_path && (
            <img className="cert-logo" src={`/api/me/logo/${c.logo_path}`} alt="" />
          )}
          <p className="cert-eyebrow">Electronic Signature Record</p>
          <h1 className="cert-title">Certificate of Completion</h1>
          <p className="cert-ref">Reference {String(token).slice(0, 16).toUpperCase()}</p>
        </header>

        <table className="cert-table">
          <tbody>
            {rows.map(([l, v]) => (
              <tr key={l}><th scope="row">{l}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>

        {c.signature_data && (
          <section className="cert-sig">
            <h2 className="cert-h2">Signature as captured</h2>
            <img className="cert-sig-img" src={c.signature_data} alt="Captured signature" />
            <p className="cert-sig-name">{c.signed_name}</p>
          </section>
        )}

        <section className="cert-hash">
          <h2 className="cert-h2">Document fingerprint (SHA-256)</h2>
          <p className="cert-hash-val">{c.doc_sha256}</p>
          <p className="cert-note">
            Any alteration to the executed document produces a different fingerprint.
          </p>
        </section>

        <section>
          <h2 className="cert-h2">Audit trail</h2>
          <table className="cert-audit">
            <tbody>
              {data.audit.map((a, i) => (
                <tr key={i}>
                  <td>{EV[a.event] || a.event}</td>
                  <td className="cert-audit-ip">{a.ip || '—'}</td>
                  <td className="cert-audit-at">{fmt(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="cert-foot">
          <p>
            This certificate is generated from the signature record held for this document.
            All times are Coordinated Universal Time.
          </p>
        </footer>

        <button type="button" className="cert-print no-print" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
    </div>
  );
}
