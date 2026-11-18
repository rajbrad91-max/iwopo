-- when the vendor last emailed the invoice to the client
ALTER TABLE "invoices" ADD COLUMN "sent_at" TIMESTAMPTZ(6);
