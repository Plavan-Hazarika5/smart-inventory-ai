-- CreateTable
CREATE TABLE "public"."audit_log" (
    "id" SERIAL NOT NULL,
    "sku_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "original_qty" INTEGER NOT NULL,
    "final_qty" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."audit_log" ADD CONSTRAINT "audit_log_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
