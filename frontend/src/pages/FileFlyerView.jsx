import './fileflyer.css';
import ShareDrive from './ShareDrive.jsx';

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
 */
export default function FileFlyerView() {
  return (
    <div className="ff-page">
      <p className="ff-lede">
        Your files, in folders. Share any folder with a link when you want to —
        clients can download what is in it, and send things back.
      </p>
      <ShareDrive />
    </div>
  );
}
