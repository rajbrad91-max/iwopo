import { useState, useEffect, useCallback } from 'react';
import { api, fmtDateTime, getAuthToken } from '../lib/api';
import { useDialog } from '../lib/dialog.jsx';
import './requests.css';

/**
 * 🖼️ Photo Selection — what clients have sent in, per gallery.
 *
 * ⚠️ There used to be three ways to reach this: a dashboard tile that opened
 * the album LIST, this page, and the per-album view. The tile now comes
 * straight here, which is what somebody pressing a tile labelled Photo
 * Selection expects.
 *
 * Kept SEPARATE by gallery rather than pooled. One pile of everybody's
 * photographs mixed together is unusable: the whole point is knowing which
 * couple asked for what, and matching it against the files on the editing
 * machine.
 */
export default function RequestsView() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);      // which gallery is expanded
  const [copied, setCopied] = useState(null);  // brief "copied" on one card
  const dialog = useDialog();
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.requests()
      .then(d => setRows(d.requests || []))
      .catch(e => { setErr(e.message); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * 📋 The filenames, space separated, WITHOUT extensions.
   *
   * This is pasted into a print lab's order form or a search box on the
   * editing machine, and both want the bare name — "Simar's Jaggo (1 of 108)"
   * rather than the same thing with .jpg hanging off it.
   */
  async function copyNames(r) {
    const names = (r.photos || [])
      .map(p => (p.filename || '').replace(/\.[^.]+$/, ''))
      .filter(Boolean);
    if (!names.length) return setErr('No filenames to copy.');
    try {
      await navigator.clipboard.writeText(names.join(' '));
      setCopied(r.album_id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* Clipboard access can be refused — an insecure origin, or a browser
         that wants a fresher gesture. Saying so beats a button that looks
         like it worked. */
      setErr('Could not reach the clipboard — copy them from the list instead.');
    }
  }

  async function removeOrder(r) {
    if (!await dialog.confirm(
      `This removes the whole selection ${r.title} sent — ${r.count} photo${r.count === 1 ? '' : 's'} and their note. Their gallery and photographs are untouched.`,
      { title: 'Delete this order?', okLabel: 'Delete order' })) return;
    try { await api.deleteRequest(r.album_id); load(); }
    catch (e) { setErr(e.message); }
  }

  async function toggleDone(r) {
    try {
      await api.setRequestDone(r.album_id, !r.completed_at);
      load();
    } catch (e) { setErr(e.message); }
  }

  if (err) return <div className="rq-quiet">Could not load — {err}</div>;
  if (!rows) return <div className="rq-quiet">Loading…</div>;

  if (!rows.length) {
    return (
      <div className="rq-quiet">
        Nothing yet. When a client picks photos in their gallery and presses
        Send to Studio, their selection appears here.
      </div>
    );
  }

  const waiting = rows.filter(r => !r.completed_at).length;

  return (
    <div className="rq">
      <p className="rq-count">
        {waiting > 0
          ? `${waiting} ${waiting === 1 ? 'selection' : 'selections'} waiting`
          : 'Everything is done'}
      </p>

      {rows.map(r => (
        <div key={r.album_id} className={`rq-card ${r.completed_at ? 'is-done' : ''}`}>
          <button className="rq-head" onClick={() => setOpen(open === r.album_id ? null : r.album_id)}>
            <span className="rq-title">{r.title}</span>
            <span className="rq-meta">
              {r.count} {r.count === 1 ? 'photo' : 'photos'}
              {r.sent_at && ` · ${fmtDateTime(r.sent_at)}`}
            </span>
            <span className="rq-chev">{open === r.album_id ? '▲' : '▼'}</span>
          </button>

          {/* The note is the useful part — usually it says what to actually do,
              so it shows without opening anything. */}
          {r.note && <p className="rq-note">“{r.note}”</p>}

          <div className="rq-acts">
            <button className="refresh" onClick={() => toggleDone(r)}>
              {r.completed_at ? '↩︎ Not done' : '✅ Mark done'}
            </button>
            <button className="refresh" onClick={() => copyNames(r)}>
              {copied === r.album_id ? '✅ Copied' : '📋 Copy file names'}
            </button>
            <button className="refresh rq-del" onClick={() => removeOrder(r)}>
              🗑️ Delete order
            </button>
            {r.completed_at && (
              <span className="rq-done-at">Done {fmtDateTime(r.completed_at)}</span>
            )}
          </div>

          {open === r.album_id && (
            <div className="rq-files">
              {/* Filenames as well as pictures: a request has to be matched
                  against what is on the editing machine, and that is done by
                  name, not by eye. */}
              {r.photos.map(p => (
                <div key={p.id} className="rq-file">
                  <img loading="lazy" alt={p.filename || ''}
                    src={`/api/albums/file/${p.id}/thumb?token=${encodeURIComponent(getAuthToken())}`} />
                  <span>{p.filename || `#${p.id}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
