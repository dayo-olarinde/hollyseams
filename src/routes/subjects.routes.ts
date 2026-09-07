import { Router } from "express";
import {
  createMeasurementHandler,
  getSubjectHandler,
  listMeasurementsHandler,
} from "../controllers/subjects.controller";
import { requireAuth } from "../middleware/requireAuth";
import {
  validateInput,
  validateParams,
} from "../middleware/validation.middleware";
import { idParamsSchema } from "../validations/params.validation";
import { createMeasurementSchema } from "../validations/subjects.validation";

const router = Router();

router.get(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  getSubjectHandler,
);

router.get(
  "/:id/measurements",
  requireAuth,
  validateParams(idParamsSchema),
  listMeasurementsHandler,
);

router.post(
  "/:id/measurements",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(createMeasurementSchema),
  createMeasurementHandler,
);

export default router;
