-- CreateTable
CREATE TABLE "public"."sales_history" (
    "id" SERIAL NOT NULL,
    "sku_id" INTEGER NOT NULL,
    "units_sold" INTEGER NOT NULL,
    "sale_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."sales_history" ADD CONSTRAINT "sales_history_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
