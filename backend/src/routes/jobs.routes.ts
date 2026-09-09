import { Router } from "express";
import {
  createJobForSubjectHandler,
  createJobNewCustomerHandler,
  createPaymentHandler,
  deleteJobHandler,
  getJobHandler,
  getUploadSignature,
  listJobsHandler,
  updateJobHandler,
} from "../controllers/jobs.controller";
import { requireAuth } from "../middleware/requireAuth";
import {
  validateInput,
  validateParams,
  validateQuery,
} from "../middleware/validation.middleware";
import {
  createJobForSubjectSchema,
  createJobNewCustomerSchema,
  listJobsQuerySchema,
  updateJobSchema,
} from "../validations/jobs.validation";
import { createPaymentSchema } from "../validations/payments.validation";
import {
  idParamsSchema,
  jobIdParamsSchema,
} from "../validations/params.validation";

const router = Router();

router.get(
  "/",
  requireAuth,
  validateQuery(listJobsQuerySchema),
  listJobsHandler,
);

// Must be registered BEFORE /:id — otherwise "signature" is captured by the
// id param and rejected by the UUID validator, silently killing the endpoint.
router.get("/signature", requireAuth, getUploadSignature);

router.get("/:id", requireAuth, validateParams(idParamsSchema), getJobHandler);

router.post(
  "/new-customer",
  requireAuth,
  validateInput(createJobNewCustomerSchema),
  createJobNewCustomerHandler,
);

router.post(
  "/:id",
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
