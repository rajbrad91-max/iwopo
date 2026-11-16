/**
 * 📄 What a file with no picture shows instead (Raj, 2026-11-15: no emoji file icons): its type, from the extension —
 * PDF, DOCX, MP3. The stored mime is whatever the uploading client claimed and is often just octet-stream.
 */
export function fileExt(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  return i > 0 && i < s.length - 1 ? s.slice(i + 1, i + 6).toUpperCase() : 'FILE';
}
