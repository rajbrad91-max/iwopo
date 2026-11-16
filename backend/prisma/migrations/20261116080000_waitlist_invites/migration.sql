-- 🚪 Opening iwopo (Raj, 2026-11-16): who was invited from the waitlist, and the account they made (lib/waitlist.js)
ALTER TABLE "waitlist" ADD COLUMN "invited_at" TIMESTAMPTZ(3),
  ADD COLUMN "vendor_id" INTEGER;
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- someone on the waitlist who already has an account with that address
UPDATE "waitlist" w SET "vendor_id" = u."vendor_id"
  FROM "users" u
  WHERE lower(u."email") = lower(w."email") AND u."role" = 'vendor' AND u."vendor_id" IS NOT NULL;
