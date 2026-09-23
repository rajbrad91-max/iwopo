import { useState } from 'react';
import './fileflyer.css';
import ShareDrive from './ShareDrive.jsx';
import ContactsView from './ContactsView.jsx';

/** Bytes as something a person reads, not a number to decode. */
export function fmtBytes(n) {
  const b = Number(n || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 📤 File Flyer — links a vendor hands to a client to pass files either way.
 *
 * Standalone by design: a share is not tied to a lead, so it works for anyone
 * the vendor deals with — a client, a second shooter, a venue — not only
 * someone who has already booked.
 *
 * Contacts live INSIDE here rather than beside it in the sidebar, because they
 * exist for one purpose: choosing who a file goes to. They are not a general
 * address book and have nothing to do with Leads.
 */
export default function FileFlyerView() {
  const [tab, setTab] = useState('files');

  return (
    <div className="ff-page">
      <div className="ff-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'files'}
          className={`ff-tab ${tab === 'files' ? 'is-on' : ''}`}
          onClick={() => setTab('files')}>📁 Files</button>
        <button role="tab" aria-selected={tab === 'contacts'}
          className={`ff-tab ${tab === 'contacts' ? 'is-on' : ''}`}
          onClick={() => setTab('contacts')}>📇 Contacts</button>
      </div>

      {tab === 'files' ? (
        <>
          <p className="ff-lede">
            Your files, in folders. Share any folder with a link when you want to —
            clients can download what is in it, and send things back.
          </p>
          <ShareDrive />
        </>
      ) : (
        <ContactsView />
      )}
    </div>
  );
}
