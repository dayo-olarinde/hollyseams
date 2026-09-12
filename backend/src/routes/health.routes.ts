import { Router } from "express";
import { healthCheck } from "../controllers/health.controller";

// Mounted at the app root (app.ts: app.use("/", healthRouter)) — NOT under
// /api, and deliberately outside the global /api rate limiter so health
// polls can never be throttled into false 429s.
const router = Router();

router.get("/health", healthCheck);

export default router;
