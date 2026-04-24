import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe('DELETE FROM audit_log');
  await prisma.saleHistory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();

  const suppliers = await prisma.$transaction([
    prisma.supplier.create({ data: { name: "Northwind Components", email: "ops@northwind.example", leadTimeDays: 2 } }),
    prisma.supplier.create({ data: { name: "Apex Industrial", email: "orders@apex.example", leadTimeDays: 4 } }),
    prisma.supplier.create({ data: { name: "Greenline Goods", email: "supply@greenline.example", leadTimeDays: 7 } }),
    prisma.supplier.create({ data: { name: "Titan Wholesale", email: "sales@titan.example", leadTimeDays: 10 } }),
    prisma.supplier.create({ data: { name: "Summit Source", email: "team@summit.example", leadTimeDays: 14 } }),
  ]);

  const supplierByName = new Map(suppliers.map((supplier) => [supplier.name, supplier.id]));
  const productsToSeed = [
    // electronics (5)
    ["ELEC-USB-C-HUB", "USB-C Hub 7-in-1", "electronics", "Northwind Components", 20, 48, 14, 2899, 5],
    ["ELEC-HDMI-2M", "HDMI Cable 2m", "electronics", "Northwind Components", 50, 120, 98, 499, 8],
    ["ELEC-MONITOR-24", "24in IPS Monitor", "electronics", "Apex Industrial", 12, 25, 9, 15999, 2],
    ["ELEC-WIFI-ROUTER", "Dual-Band WiFi Router", "electronics", "Summit Source", 10, 22, 21, 6999, 1],
    ["ELEC-KEYBOARD-MECH", "Mechanical Keyboard", "electronics", "Titan Wholesale", 15, 30, 44, 4499, 2],
    // apparel (5)
    ["APP-TSHIRT-BLK-M", "Basic T-Shirt Black M", "apparel", "Apex Industrial", 30, 65, 29, 899, 7],
    ["APP-HOODIE-GRY-L", "Pullover Hoodie Gray L", "apparel", "Apex Industrial", 15, 35, 11, 2499, 0],
    ["APP-JACKET-NVY-L", "Softshell Jacket Navy L", "apparel", "Summit Source", 8, 18, 6, 5599, 1],
    ["APP-SOCKS-WHT", "Crew Socks White Pair", "apparel", "Greenline Goods", 40, 95, 88, 399, 9],
    ["APP-CAP-BLK", "Baseball Cap Black", "apparel", "Titan Wholesale", 20, 45, 43, 1299, 3],
    // consumables (5)
    ["CONS-HANDSOAP-500", "Hand Soap 500ml", "consumables", "Greenline Goods", 40, 90, 84, 299, 10],
    ["CONS-BATTERY-AA-24", "AA Batteries Pack 24", "consumables", "Greenline Goods", 25, 55, 24, 1099, 6],
    ["CONS-PAPER-A4-500", "A4 Paper Ream 500", "consumables", "Northwind Components", 35, 85, 62, 699, 8],
    ["CONS-CLEAN-WIPES", "Sanitizing Wipes 80ct", "consumables", "Titan Wholesale", 30, 70, 57, 599, 7],
    ["CONS-INK-BLACK", "Printer Ink Black", "consumables", "Summit Source", 12, 28, 26, 1799, 2],
    // tools (5)
    ["TOOL-DRILL-18V", "Cordless Drill 18V", "tools", "Titan Wholesale", 8, 16, 5, 12499, 0],
    ["TOOL-TAPE-5M", "Tape Measure 5m", "tools", "Titan Wholesale", 20, 40, 31, 799, 3],
    ["TOOL-HAMMER-16OZ", "Claw Hammer 16oz", "tools", "Apex Industrial", 18, 35, 33, 1499, 2],
    ["TOOL-SCREWDRIVER-SET", "Precision Screwdriver Set", "tools", "Northwind Components", 14, 28, 27, 2199, 2],
    ["TOOL-WRENCH-ADJ", "Adjustable Wrench", "tools", "Summit Source", 10, 22, 19, 1899, 2],
  ];

  await prisma.product.createMany({
    data: productsToSeed.map((product) => ({
      sku: product[0],
      name: product[1],
      category: product[2],
      supplierId: supplierByName.get(product[3]) ?? suppliers[0].id,
      minStock: product[4],
      reorderPoint: product[5],
      currentStock: product[6],
      unitCostCents: product[7],
    })),
  });

  const products = await prisma.product.findMany({ select: { id: true, sku: true } });
  const productBySku = new Map(products.map((product) => [product.sku, product.id]));
  const now = new Date();

  const baseDailyDemand = new Map(productsToSeed.map((product) => [product[0], product[8]]));
  const zeroVelocitySkus = new Set(["TOOL-DRILL-18V", "APP-HOODIE-GRY-L"]);
  const salesRows = [];

  for (let dayOffset = 0; dayOffset < 90; dayOffset += 1) {
    const saleDate = new Date(now);
    saleDate.setUTCDate(now.getUTCDate() - dayOffset);
    saleDate.setUTCHours(12, 0, 0, 0);

    const monthWave = 1 + 0.18 * Math.sin(dayOffset / 14);
    const weekWave = 1 + 0.1 * Math.cos(dayOffset / 3);
    const weekendFactor = dayOffset % 7 === 0 || dayOffset % 7 === 6 ? 1.15 : 0.95;
    const trendFactor = dayOffset < 20 ? 1.08 : dayOffset > 70 ? 0.92 : 1;

    for (const [sku, base] of baseDailyDemand.entries()) {
      const skuId = productBySku.get(sku);
      if (!skuId) continue;

      const unitsSold = zeroVelocitySkus.has(sku)
        ? 0
        : Math.max(0, Math.round(base * monthWave * weekWave * weekendFactor * trendFactor));

      salesRows.push({
        skuId,
        unitsSold,
        saleDate,
      });
    }
  }

  await prisma.saleHistory.createMany({ data: salesRows });

  console.log("Seed complete: 5 suppliers, 20 SKUs, and 90 days of seasonal sales history inserted.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
