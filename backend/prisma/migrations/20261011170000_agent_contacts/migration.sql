-- CreateTable
CREATE TABLE "agent_contacts" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "name" VARCHAR(120),
    "phone" VARCHAR(20),
    "email" VARCHAR(200),
    "line" TEXT NOT NULL,
    "last_seen" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agent_contacts_phone" ON "agent_contacts"("vendor_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "uq_agent_contacts_vendor_key" ON "agent_contacts"("vendor_id", "key");

-- AddForeignKey
ALTER TABLE "agent_contacts" ADD CONSTRAINT "agent_contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

