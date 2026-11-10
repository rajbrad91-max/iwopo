import { useState } from 'react';

/**
 * 🏷️ A shoot's name, renamable along the way (Raw Selector, Raj 2026-11-09: "anybody in between can change the name") —
 * the vendor on the rail, the photographer and the editor in their portals. `onSave(name)` saves it; the server
 * (lib/shoots.js renameShoot) carries the new name to the shoot's gallery-to-be or gallery too.
 */
export default function RenameField({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) { setErr('A name is needed'); return; }
    try { await onSave(v); setEditing(false); setErr(''); }
    catch (x) { setErr(x.message); }
  }
  if (!editing) {
    return (
      <span className="rn">
        <b className="rn-name">{name}</b>
        <button className="rn-btn" type="button" onClick={() => { setValue(name); setEditing(true); }} title="Rename" aria-label={`Rename ${name}`}>✏️</button>
      </span>
    );
  }
  return (
    <form className="rn rn-edit" onSubmit={save}>
      <input className="rn-input" value={value} onChange={e => setValue(e.target.value)} maxLength={160} aria-label="Name" autoFocus />
      <button className="rs-x" type="submit">Save</button>
      <button className="rs-x" type="button" onClick={() => { setEditing(false); setErr(''); }}>Cancel</button>
      {err && <span className="rn-err">⚠️ {err}</span>}
    </form>
  );
}
