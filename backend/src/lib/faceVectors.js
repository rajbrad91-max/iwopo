/**
 * 🧬 Face fingerprints, stored compactly (audit 2026-11-14 — Raj: "faces yes").
 *
 * A fingerprint is 512 numbers. Written as JSON text inside photos.faces they took about 10 KB each — 409 MB of a
 * 436 MB table on live. They now live in photos.face_vectors as raw 64-bit floats: 4 KB each, and the SAME numbers
 * bit for bit (a float64 holds exactly the value the JSON held), so every distance, selfie match and circle comes
 * out exactly as before. Reading them is a copy, not a parse.
 *
 * Layout of photos.face_vectors: the fingerprints of the photo's faces, in face order, each 512 big-endian float64,
 * back to back. A face with no fingerprint (a speck too small to compare) keeps `descriptor: null` in photos.faces
 * and takes no room; every other face's descriptor is left out of the JSON and read from face_vectors.
 *
 *   write: prisma.photos.update({ data: { ...splitFaces(found), … } })
 *   read:  select { faces: true, face_vectors: true } → withDescriptors(photo) — the faces as the engine made them
 */
import { DESCRIPTOR_LENGTH } from './faceEngine.js';

const BYTES = DESCRIPTOR_LENGTH * 8;

/** the engine's faces → { faces, face_vectors } for photos */
export function splitFaces(found) {
  const vectors = [];
  const faces = found.map(({ descriptor, ...rest }) => {
    if (!descriptor) return { ...rest, descriptor: null };
    if (descriptor.length !== DESCRIPTOR_LENGTH) throw new Error(`a face fingerprint must have ${DESCRIPTOR_LENGTH} numbers`);
    vectors.push(descriptor);
    return rest;
  });
  if (!vectors.length) return { faces, face_vectors: null };
  const bytes = new Uint8Array(vectors.length * BYTES);
  const view = new DataView(bytes.buffer);
  vectors.forEach((v, i) => { for (let j = 0; j < DESCRIPTOR_LENGTH; j++) view.setFloat64(i * BYTES + j * 8, v[j]); });
  return { faces, face_vectors: bytes };
}

/** a photo row ({ faces, face_vectors }) → its faces, each with its descriptor (an array, or null) */
export function withDescriptors({ faces, face_vectors }) {
  if (!Array.isArray(faces)) return [];
  const view = face_vectors ? new DataView(face_vectors.buffer, face_vectors.byteOffset, face_vectors.byteLength) : null;
  let next = 0;
  return faces.map((f) => {
    if ('descriptor' in f) return f;                       // null: never fingerprinted
    const at = next++ * BYTES;
    if (!view || at + BYTES > view.byteLength) return { ...f, descriptor: null };   // vectors missing: never compared
    const descriptor = new Array(DESCRIPTOR_LENGTH);
    for (let j = 0; j < DESCRIPTOR_LENGTH; j++) descriptor[j] = view.getFloat64(at + j * 8);
    return { ...f, descriptor };
  });
}
