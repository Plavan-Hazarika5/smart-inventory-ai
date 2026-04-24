import { z } from "zod";
import { prisma } from "./db.js";

export const inventoryStatusSchema = z.enum(["ok", "low", "critical"]);

export const inventoryStatusItemSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  supplier_id: z.number().int(),
  supplier_name: z.string(),
  current_stock: z.number().int(),
  reorder_point: z.number().int(),
  min_stock: z.number().int(),
  unit_cost: z.number().int(),
  status: inventoryStatusSchema,
});

export const inventoryStatusResponseSchema = z.object({
  data: z.array(inventoryStatusItemSchema),
});

export type InventoryStatusResponse = z.infer<typeof inventoryStatusResponseSchema>;

const daysOfStockLeftSchema = z.union([
  z.number(),
  z.literal("no velocity data"),
]);

export const inventoryVelocityItemSchema = inventoryStatusItemSchema.extend({
  avg_daily_sales: z.number(),
  avg_weekly_sales: z.number(),
  days_of_stock_left: daysOfStockLeftSchema,
});

export const inventoryVelocityResponseSchema = z.object({
  data: z.array(inventoryVelocityItemSchema),
});

export type InventoryVelocityResponse = z.infer<typeof inventoryVelocityResponseSchema>;
export const reorderConfidenceSchema = z.enum(["high", "medium", "low"]);

export const reorderRecommendationFilterSchema = z.object({
  supplier_id: z.number().int().positive().optional(),
  category: z.string().min(1).optional(),
});

export type ReorderRecommendationFilters = z.infer<typeof reorderRecommendationFilterSchema>;

export const reorderRecommendationItemSchema = z.object({
  sku_id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  supplier_id: z.number().int(),
  supplier_name: z.string(),
  category: z.string(),
  reorder_qty: z.number().int(),
  original_reorder_qty: z.number().int(),
  avg_weekly_sales: z.number(),
  confidence: reorderConfidenceSchema,
  reason: z.string(),
});

export const reorderRecommendationResponseSchema = z.object({
  data: z.array(reorderRecommendationItemSchema),
});

export type ReorderRecommendationResponse = z.infer<typeof reorderRecommendationResponseSchema>;
export const reorderExportRowSchema = z.object({
  supplier_name: z.string(),
  sku: z.string(),
  product_name: z.string(),
  reorder_qty: z.number().int(),
  unit_cost: z.number().int(),
  total_cost: z.number().int(),
});

export const reorderEmailPreviewItemSchema = z.object({
  supplier_name: z.string(),
  subject: z.string(),
  body: z.string(),
});

export const reorderEmailPreviewResponseSchema = z.object({
  data: z.array(reorderEmailPreviewItemSchema),
});

type ReorderExportRow = z.infer<typeof reorderExportRowSchema>;
type ReorderEmailPreviewResponse = z.infer<typeof reorderEmailPreviewResponseSchema>;
export const reorderApprovalRequestSchema = z.object({
  sku: z.string().min(1),
  final_qty: z.number().int().nonnegative().optional(),
  user_name: z.string().min(1).default("admin"),
  confirm_overorder: z.boolean().default(false),
});

export const reorderApprovalResponseSchema = z.object({
  ok: z.boolean(),
  action: z.enum(["approved", "overridden", "rejected"]),
  message: z.string(),
});

export const auditLogItemSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  action: z.enum(["approved", "overridden", "rejected"]),
  original_qty: z.number().int(),
  final_qty: z.number().int(),
  user_name: z.string(),
  timestamp: z.string(),
});

export const auditLogResponseSchema = z.object({
  data: z.array(auditLogItemSchema),
});

function isOverOrder(reorderQty: number, avgWeeklySales: number) {
  return reorderQty > avgWeeklySales * 8;
}

function deriveStatus(currentStock: number, reorderPoint: number, minStock: number) {
  if (currentStock <= minStock) {
    return "critical" as const;
  }
  if (currentStock <= reorderPoint) {
    return "low" as const;
  }
  return "ok" as const;
}

function getVelocityMetrics(salesHistory: { unitsSold: number; saleDate: Date }[]) {
  const totalUnitsSold = salesHistory.reduce((sum, row) => sum + row.unitsSold, 0);
  const avgDailySales = Number((totalUnitsSold / 30).toFixed(2));
  const avgWeeklySales = Number((avgDailySales * 7).toFixed(2));
  const activeSalesDays = new Set(
    salesHistory.filter((row) => row.unitsSold > 0).map((row) => row.saleDate.toISOString().slice(0, 10)),
  ).size;

  const mean = avgDailySales;
  const variance = mean === 0
    ? 1
    : salesHistory.reduce((acc, row) => acc + (row.unitsSold - mean) ** 2, 0) / Math.max(salesHistory.length, 1);
  const stdDev = Math.sqrt(variance);
  const varianceRatio = mean === 0 ? 1 : stdDev / mean;

  return { totalUnitsSold, avgDailySales, avgWeeklySales, activeSalesDays, varianceRatio };
}

function deriveConfidence(activeSalesDays: number, varianceRatio: number, totalUnitsSold: number) {
  if (totalUnitsSold === 0 || activeSalesDays < 15 || varianceRatio >= 0.4) {
    return "low" as const;
  }
  if (activeSalesDays >= 30 && varianceRatio < 0.2) {
    return "high" as const;
  }
  return "medium" as const;
}

export async function getInventoryStatus(): Promise<InventoryStatusResponse> {
  const products = await prisma.product.findMany({
    include: { supplier: true },
    orderBy: { sku: "asc" },
  });

  const data = products.map((product: (typeof products)[number]) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    supplier_id: product.supplierId,
    supplier_name: product.supplier.name,
    current_stock: product.currentStock,
    reorder_point: product.reorderPoint,
    min_stock: product.minStock,
    unit_cost: product.unitCostCents,
    status: deriveStatus(product.currentStock, product.reorderPoint, product.minStock),
  }));

  return inventoryStatusResponseSchema.parse({ data });
}

export async function getInventoryVelocity(): Promise<InventoryVelocityResponse> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const products = await prisma.product.findMany({
    include: {
      supplier: true,
      salesHistory: {
        where: { saleDate: { gte: thirtyDaysAgo } },
      },
    },
    orderBy: { sku: "asc" },
  });

  const data = products.map((product: (typeof products)[number]) => {
    const { totalUnitsSold, avgDailySales, avgWeeklySales } = getVelocityMetrics(product.salesHistory);
    const hasVelocityData = totalUnitsSold > 0;

    const baseStatus = deriveStatus(product.currentStock, product.reorderPoint, product.minStock);
    const status = hasVelocityData ? baseStatus : baseStatus === "critical" ? "critical" : "low";
    const daysOfStockLeft = hasVelocityData
      ? Number((product.currentStock / avgDailySales).toFixed(2))
      : "no velocity data";

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      supplier_id: product.supplierId,
      supplier_name: product.supplier.name,
      current_stock: product.currentStock,
      reorder_point: product.reorderPoint,
      min_stock: product.minStock,
      unit_cost: product.unitCostCents,
      status,
      avg_daily_sales: avgDailySales,
      avg_weekly_sales: avgWeeklySales,
      days_of_stock_left: daysOfStockLeft,
    };
  });

  return inventoryVelocityResponseSchema.parse({ data });
}

export async function getReorderRecommendations(
  rawFilters: unknown,
): Promise<ReorderRecommendationResponse> {
  const filters = reorderRecommendationFilterSchema.parse(rawFilters ?? {});

  const products = await prisma.product.findMany({
    where: {
      ...(filters.supplier_id ? { supplierId: filters.supplier_id } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    include: {
      supplier: true,
      salesHistory: true,
    },
    orderBy: { sku: "asc" },
  });

  const recommendations = products.map((product: (typeof products)[number]) => {
    const { totalUnitsSold, avgDailySales, avgWeeklySales, activeSalesDays, varianceRatio } = getVelocityMetrics(product.salesHistory);
    const confidence = deriveConfidence(activeSalesDays, varianceRatio, totalUnitsSold);
    const safetyStock = avgDailySales * (product.supplier.leadTimeDays * 0.5);
    const rawReorderQty = avgDailySales * product.supplier.leadTimeDays + safetyStock - product.currentStock;
    const reorderQty = Math.max(0, Math.ceil(rawReorderQty));

    let reason = `Lead time ${product.supplier.leadTimeDays}d, avg daily sales ${avgDailySales}.`;
    if (totalUnitsSold === 0) {
      reason = "No sales in last 30 days; conservative recommendation with low confidence.";
    } else if (confidence === "high") {
      reason = "30-day sales data with low variance indicates stable demand.";
    } else if (confidence === "medium") {
      reason = "Demand trend is usable but includes moderate variance or fewer active sales days.";
    } else if (confidence === "low") {
      reason = "Limited sales data or high variance lowers forecast reliability.";
    }

    return {
      sku_id: product.id,
      sku: product.sku,
      name: product.name,
      supplier_id: product.supplierId,
      supplier_name: product.supplier.name,
      category: product.category,
      reorder_qty: reorderQty,
      original_reorder_qty: reorderQty,
      avg_weekly_sales: avgWeeklySales,
      confidence,
      reason,
    };
  });

  return reorderRecommendationResponseSchema.parse({ data: recommendations });
}

async function getExportRows(confirmOverorder = false): Promise<ReorderExportRow[]> {
  const recommendations = await getReorderRecommendations({});
  const positiveRecommendations = recommendations.data.filter((item) => item.reorder_qty > 0);
  const blocked = positiveRecommendations.find((item) => isOverOrder(item.reorder_qty, item.avg_weekly_sales));
  if (blocked && !confirmOverorder) {
    throw new Error("Reorder quantity exceeds 8 weeks of demand - confirm intent.");
  }
  if (positiveRecommendations.length === 0) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      sku: { in: positiveRecommendations.map((item) => item.sku) },
    },
    select: {
      sku: true,
      unitCostCents: true,
    },
  });

  const unitCostBySku = new Map(products.map((product) => [product.sku, product.unitCostCents]));

  const rows = positiveRecommendations.map((item) => {
    const unitCost = unitCostBySku.get(item.sku) ?? 0;
    return {
      supplier_name: item.supplier_name,
      sku: item.sku,
      product_name: item.name,
      reorder_qty: item.reorder_qty,
      unit_cost: unitCost,
      total_cost: unitCost * item.reorder_qty,
    };
  });

  return rows.map((row) => reorderExportRowSchema.parse(row));
}

export async function getReorderCsv(confirmOverorder = false): Promise<string> {
  const rows = await getExportRows(confirmOverorder);
  const header = "supplier_name,sku,product_name,reorder_qty,unit_cost,total_cost";
  const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

  const csvRows = rows.map((row) => (
    [
      escapeCsv(row.supplier_name),
      escapeCsv(row.sku),
      escapeCsv(row.product_name),
      escapeCsv(row.reorder_qty),
      escapeCsv(row.unit_cost),
      escapeCsv(row.total_cost),
    ].join(",")
  ));

  return [header, ...csvRows].join("\n");
}

export async function getReorderEmailPreview(confirmOverorder = false): Promise<ReorderEmailPreviewResponse> {
  const rows = await getExportRows(confirmOverorder);
  const grouped = new Map<string, ReorderExportRow[]>();

  for (const row of rows) {
    if (!grouped.has(row.supplier_name)) {
      grouped.set(row.supplier_name, []);
    }
    grouped.get(row.supplier_name)?.push(row);
  }

  const data = Array.from(grouped.entries()).map(([supplierName, supplierRows]) => {
    const subject = `Reorder Request — ${supplierName}`;
    const lines = supplierRows.map((row) =>
      `- ${row.sku} (${row.product_name}): ${row.reorder_qty} units`,
    );
    const body = [
      `Subject: ${subject}`,
      "",
      `Dear ${supplierName} team,`,
      "Please find our reorder request below:",
      ...lines,
      "",
      "Thank you,",
      "Inventory Operations",
    ].join("\n");

    return {
      supplier_name: supplierName,
      subject,
      body,
    };
  });

  return reorderEmailPreviewResponseSchema.parse({ data });
}

export async function approveReorder(rawPayload: unknown) {
  const payload = reorderApprovalRequestSchema.parse(rawPayload);
  const recommendations = await getReorderRecommendations({});
  const recommendation = recommendations.data.find((item) => item.sku === payload.sku);

  if (!recommendation) {
    throw new Error("Recommendation not found for SKU.");
  }

  const finalQty = payload.final_qty ?? recommendation.reorder_qty;
  if (isOverOrder(finalQty, recommendation.avg_weekly_sales) && !payload.confirm_overorder) {
    throw new Error("Reorder quantity exceeds 8 weeks of demand - confirm intent.");
  }

  const action = finalQty === recommendation.reorder_qty ? "approved" : "overridden";

  await prisma.$executeRaw`
    INSERT INTO audit_log (sku_id, action, original_qty, final_qty, user_name, timestamp)
    VALUES (${recommendation.sku_id}, ${action}, ${recommendation.reorder_qty}, ${finalQty}, ${payload.user_name}, NOW())
  `;

  return reorderApprovalResponseSchema.parse({
    ok: true,
    action,
    message: action === "approved" ? "Recommendation approved." : "Recommendation overridden and approved.",
  });
}

export async function rejectReorder(rawPayload: unknown) {
  const payload = reorderApprovalRequestSchema.parse(rawPayload);
  const recommendations = await getReorderRecommendations({});
  const recommendation = recommendations.data.find((item) => item.sku === payload.sku);

  if (!recommendation) {
    throw new Error("Recommendation not found for SKU.");
  }

  await prisma.$executeRaw`
    INSERT INTO audit_log (sku_id, action, original_qty, final_qty, user_name, timestamp)
    VALUES (${recommendation.sku_id}, ${"rejected"}, ${recommendation.reorder_qty}, ${payload.final_qty ?? 0}, ${payload.user_name}, NOW())
  `;

  return reorderApprovalResponseSchema.parse({
    ok: true,
    action: "rejected",
    message: "Recommendation rejected.",
  });
}

export async function getAuditLogs() {
  const logs = await prisma.$queryRaw<Array<{
    id: number;
    sku: string;
    action: "approved" | "overridden" | "rejected";
    original_qty: number;
    final_qty: number;
    user_name: string;
    timestamp: Date;
  }>>`
    SELECT a.id, p.sku, a.action, a.original_qty, a.final_qty, a.user_name, a.timestamp
    FROM audit_log a
    JOIN products p ON p.id = a.sku_id
    ORDER BY a.timestamp DESC
  `;

  return auditLogResponseSchema.parse({
    data: logs.map((log) => ({
      id: log.id,
      sku: log.sku,
      action: log.action,
      original_qty: log.original_qty,
      final_qty: log.final_qty,
      user_name: log.user_name,
      timestamp: log.timestamp.toISOString(),
    })),
  });
}
