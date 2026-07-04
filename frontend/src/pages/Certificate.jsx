import { useState, useEffect } from 'react';

export default function Certificate({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/contracts/certificate/${token}`)
      .then(r => r.json())
      .then(d => d.error ? setErr(d.error) : setData(d))
      .catch(() => setErr('Failed to load'));
  }, [token]);

  if (err) return <div style={wrap}><div style={card}>⚠️ {err}</div></div>;
  if (!data) return <div style={wrap}><div style={card}>Loading…</div></div>;

  const c = data.certificate;
  const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
  const EV = { created: '📄 Created', viewed: '👀 Viewed by client', signed: '✍️ Signed', finalized: '🔐 Finalized' };

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 680 }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #0f766e', paddingBottom: 16 }}>
          <div style={{ fontSize: 40 }}>📜</div>
          <h1 style={{ margin: '6px 0 2px', fontSize: 22, color: '#0f766e' }}>Certificate of Completion</h1>
          <div style={{ color: '#666', fontSize: 13 }}>Electronic Signature Record</div>
        </div>

        <table style={{ width: '100%', fontSize: 14, marginTop: 18, borderCollapse: 'collapse' }}>
          <tbody>
            <Tr l="📄 Document" v={c.title} />
            <Tr l="🏢 Sent by" v={c.business_name} />
            <Tr l="👤 Signer" v={`${c.signed_name} (${c.client_email || '—'})`} />
            <Tr l="🎉 Event" v={`${c.event_type || '—'}${c.event_date ? ' · ' + String(c.event_date).slice(0, 10) : ''}`} />
            <Tr l="🕐 Created" v={fmt(c.created_at)} />
            <Tr l="👀 First viewed" v={fmt(c.viewed_at)} />
            <Tr l="✍️ Signed" v={fmt(c.signed_at)} />
            <Tr l="🌐 Signer IP" v={c.signed_ip || '—'} />
            <Tr l="✅ Initials" v={`${(c.initials || []).filter(Boolean).length} completed`} />
          </tbody>
        </table>

        {c.signature_data && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>🖊️ Captured signature</div>
            <img src={c.signature_data} alt="signature"
              style={{ maxWidth: 260, background: '#0d1417', borderRadius: 8, padding: 8, border: '1px solid #ddd' }} />
          </div>
        )}

        <div style={{ marginTop: 16, background: '#f4f7f6', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#666' }}>🔐 Document fingerprint (SHA-256)</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginTop: 4 }}>{c.doc_sha256}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f766e', marginBottom: 6 }}>📋 Audit trail</div>
          {data.audit.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <span>{EV[a.event] || a.event}{a.ip ? ` · ${a.ip}` : ''}</span>
              <span style={{ color: '#666' }}>{fmt(a.created_at)}</span>
            </div>
          ))}
        </div>

        <button onClick={() => window.print()} className="no-print"
          style={{ marginTop: 20, width: '100%', padding: 12, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          🖨️ Print / Save PDF
        </button>
        <style>{`@media print { .no-print { display: none } }`}</style>
      </div>
    </div>
  );
}

function Tr({ l, v }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '8px 4px', color: '#666', width: 150 }}>{l}</td>
      <td style={{ padding: '8px 4px', fontWeight: 600 }}>{v}</td>
    </tr>
  );
}

const wrap = { minHeight: '100vh', background: '#f4f7f6', display: 'flex', justifyContent: 'center', padding: 24, fontFamily: "'Segoe UI', sans-serif" };
const card = { background: '#fff', borderRadius: 14, padding: 30, width: '100%', boxShadow: '0 2px 14px rgba(0,0,0,0.07)', color: '#222', height: 'fit-content' };
