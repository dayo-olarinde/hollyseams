import { Router } from "express";
import {
  createJobForSubjectHandler,
  createJobNewCustomerHandler,
  createPaymentHandler,
  deleteJobHandler,
  getJobHandler,
  listJobsHandler,
  updateJobHandler,
} from "../controllers/jobs.controller";
import { requireAuth } from "../middleware/requireAuth";
import {
  validateInput,
  validateParams,
} from "../middleware/validation.middleware";
import {
  createJobForSubjectSchema,
  createJobNewCustomerSchema,
  updateJobSchema,
} from "../validations/jobs.validation";
import { createPaymentSchema } from "../validations/payments.validation";
import {
  idParamsSchema,
  jobIdParamsSchema,
} from "../validations/params.validation";

const router = Router();

router.get("/", requireAuth, listJobsHandler);

router.get("/:id", requireAuth, validateParams(idParamsSchema), getJobHandler);

router.post(
  "/new-customer",
  requireAuth,
  validateInput(createJobNewCustomerSchema),
  createJobNewCustomerHandler,
);

router.post(
  "/:id/jobs",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(createJobForSubjectSchema),
  createJobForSubjectHandler,
);

router.patch(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(updateJobSchema),
  updateJobHandler,
);

router.delete(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  deleteJobHandler,
);

router.post(
  "/:jobId/payments",
  requireAuth,
  validateParams(jobIdParamsSchema),
  validateInput(createPaymentSchema),
  createPaymentHandler,
);

export default router;
