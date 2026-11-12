-- ✏️ "Edit this contract": one client's own version of a contract template (Raj, 2026-11-12)
ALTER TABLE "contract_templates" ADD COLUMN "lead_id" INTEGER;
ALTER TABLE "contract_templates" ADD COLUMN "copied_from_id" INTEGER;
CREATE UNIQUE INDEX "contract_templates_lead_id_key" ON "contract_templates"("lead_id");
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
