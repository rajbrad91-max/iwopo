-- 🧬 Face fingerprints, compact (audit 2026-11-14 — Raj: "faces yes"). Each face's 512 numbers move from JSON text in
-- photos.faces to photos.face_vectors as raw 64-bit floats, in face order (lib/faceVectors.js). float8send writes the
-- exact double each JSON number stands for, so every fingerprint is the same value bit for bit. A face without a
-- fingerprint keeps "descriptor": null; every other face loses its "descriptor" key from the JSON.
ALTER TABLE "photos" ADD COLUMN "face_vectors" BYTEA;

UPDATE "photos" p
   SET "face_vectors" = v.vectors, "faces" = v.faces
  FROM (
    SELECT ph.id,
           (SELECT string_agg(float8send(d.x::float8), ''::bytea ORDER BY e.i, d.j)
              FROM jsonb_array_elements(ph.faces) WITH ORDINALITY e(f, i)
              CROSS JOIN LATERAL jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(e.f->'descriptor') = 'array' THEN e.f->'descriptor' END) WITH ORDINALITY d(x, j)) AS vectors,
           (SELECT jsonb_agg(CASE WHEN jsonb_typeof(e.f->'descriptor') = 'array' THEN e.f - 'descriptor'
                                  ELSE jsonb_set(e.f, '{descriptor}', 'null') END ORDER BY e.i)
              FROM jsonb_array_elements(ph.faces) WITH ORDINALITY e(f, i)) AS faces
      FROM "photos" ph
     WHERE jsonb_typeof(ph.faces) = 'array' AND jsonb_array_length(ph.faces) > 0
  ) v
 WHERE v.id = p.id;
