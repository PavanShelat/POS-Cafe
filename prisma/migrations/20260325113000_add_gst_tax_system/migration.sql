ALTER TABLE "pos_config"
ADD COLUMN "gstin" TEXT;

ALTER TABLE "orders"
ADD COLUMN "invoice_number" TEXT,
ADD COLUMN "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "customer_phone" TEXT;

UPDATE "orders"
SET
  "invoice_number" = 'INV-' || TO_CHAR("created_at", 'YYYYMMDD') || '-' || UPPER(REPLACE(SUBSTRING("id"::text FROM 1 FOR 8), '-', '')),
  "subtotal" = "total_amount",
  "discount" = 0,
  "taxable_amount" = "total_amount",
  "cgst_rate" = 0,
  "sgst_rate" = 0,
  "cgst_amount" = 0,
  "sgst_amount" = 0
WHERE "invoice_number" IS NULL;

ALTER TABLE "orders"
ALTER COLUMN "invoice_number" SET NOT NULL;

CREATE UNIQUE INDEX "orders_invoice_number_key" ON "orders"("invoice_number");
