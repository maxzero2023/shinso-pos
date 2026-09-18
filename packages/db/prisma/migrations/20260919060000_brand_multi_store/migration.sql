-- AUT-37 / AUT-94: Brand 1—N Store; Staff brand scope + brand_admin/manager roles

-- New roles (PG allows ADD VALUE in a transaction on PG 12+)
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'brand_admin';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'manager';

-- Brand table
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- Mount existing stores under a default brand
INSERT INTO "Brand" ("id", "name", "createdAt", "updatedAt")
VALUES ('brand_shinso_demo_default', 'SHINSO Demo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Store" ADD COLUMN "brandId" TEXT;

UPDATE "Store" SET "brandId" = 'brand_shinso_demo_default' WHERE "brandId" IS NULL;

ALTER TABLE "Store" ALTER COLUMN "brandId" SET NOT NULL;

ALTER TABLE "Store" ADD CONSTRAINT "Store_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Store_brandId_idx" ON "Store"("brandId");

-- Staff: optional storeId + brandId
ALTER TABLE "Staff" ADD COLUMN "brandId" TEXT;

ALTER TABLE "Staff" ALTER COLUMN "storeId" DROP NOT NULL;

-- Backfill brandId for existing staff from their store
UPDATE "Staff" s
SET "brandId" = st."brandId"
FROM "Store" st
WHERE s."storeId" = st."id" AND s."brandId" IS NULL;

ALTER TABLE "Staff" ADD CONSTRAINT "Staff_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Staff_brandId_idx" ON "Staff"("brandId");
