import { Router } from "express";
import {
  monthlyRevenueHandler,
  outstandingPaymentsHandler,
  topCustomersHandler,
} from "../controllers/reports.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validateQuery } from "../middleware/validation.middleware";
import { topCustomersQuerySchema } from "../validations/reports.validation";

const router = Router();

router.get("/monthly-revenue", requireAuth, monthlyRevenueHandler);

router.get(
  "/top-customers",
  requireAuth,
  validateQuery(topCustomersQuerySchema),
  topCustomersHandler,
);

router.get("/outstanding-payments", requireAuth, outstandingPaymentsHandler);

export default router;
