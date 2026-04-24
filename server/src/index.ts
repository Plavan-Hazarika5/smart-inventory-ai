import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ZodError } from "zod";
import {
  getInventoryStatus,
  getInventoryVelocity,
  getReorderRecommendations,
  getReorderCsv,
  getReorderEmailPreview,
  approveReorder,
  rejectReorder,
  getAuditLogs,
} from "./inventory.js";

dotenv.config();

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

app.get("/api/inventory/status", async (_req, res, next) => {
  try {
    const result = await getInventoryStatus();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/inventory/velocity", async (_req, res, next) => {
  try {
    const result = await getInventoryVelocity();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reorder/recommend", async (req, res, next) => {
  try {
    const result = await getReorderRecommendations(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reorder/export/csv", async (req, res, next) => {
  try {
    const confirmOverorder = req.query.confirm_overorder === "true";
    const csv = await getReorderCsv(confirmOverorder);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=reorder-recommendations.csv");
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reorder/export/email-preview", async (req, res, next) => {
  try {
    const confirmOverorder = req.query.confirm_overorder === "true";
    const result = await getReorderEmailPreview(confirmOverorder);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reorder/approve", async (req, res, next) => {
  try {
    const result = await approveReorder(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reorder/reject", async (req, res, next) => {
  try {
    const result = await rejectReorder(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reorder/audit", async (_req, res, next) => {
  try {
    const result = await getAuditLogs();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.message.includes("8 weeks of demand")) {
    res.status(400).json({
      error: "OverOrderGuardrail",
      message: "Reorder quantity exceeds 8 weeks of demand - confirm intent.",
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "ValidationError",
      details: error.flatten(),
    });
    return;
  }

  res.status(500).json({
    error: "InternalServerError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
