import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';

/**
 * 📡 A crew member's camera FTP login (Raw Selector, Raj 2026-11-09) — opened from Crew Management. Shows what to set on
 * the camera (server, port, user, password, secure FTP), and creates the login or gives it a new password. The
 * photographer chooses in his portal which shoot the camera's uploads go to. Server side: lib/cameraFtp.js.
 */
export default function CameraFtpBox({ member, onClose }) {
  const dialog = useDialog();
  const [ftp, setFtp] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.crewFtp(member.id).then(setFtp).catch(e => setErr(e.message)); }, [member.id]);

  async function make() {
    if (ftp?.user && !await dialog.confirm(`The camera will need the new password before it can upload again.`, { title: 'Give a new password?', okLabel: 'New password' })) return;
    setBusy(true); setErr('');
    try { setFtp(await api.crewFtpReset(member.id)); } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="cftp" role="dialog" aria-modal="true" aria-label={`Camera FTP — ${member.name}`} onClick={e => e.stopPropagation()}>
        <div className="al-head">
          <h3 className="al-title">📡 Camera FTP · {member.name}</h3>
          <button className="al-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {err && <div className="err-banner">⚠️ {err}</div>}
        {!ftp ? <p className="cftp-note">Loading…</p> : (
          <>
            <p className="cftp-note">Set these on {member.name}&apos;s camera (FTP transfer). In the photographer&apos;s page, they choose which shoot the camera&apos;s photos go to.</p>
            {ftp.user ? (
              <dl className="cftp-grid">
                <dt>Server</dt><dd>{ftp.host}</dd>
                <dt>Port</dt><dd>{ftp.port}</dd>
                <dt>User</dt><dd>{ftp.user}</dd>
                <dt>Password</dt><dd>{ftp.password}</dd>
                <dt>Secure FTP</dt><dd>On (FTPS)</dd>
                <dt>Passive mode</dt><dd>On</dd>
              </dl>
            ) : <p className="cftp-note">No FTP login yet.</p>}
            <div className="cftp-foot">
              <button className="refresh gal-save" type="button" disabled={busy} onClick={make}>{ftp.user ? 'New password' : 'Create the FTP login'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
