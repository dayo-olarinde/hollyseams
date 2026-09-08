import { Router } from "express";
import {
  createCustomerHandler,
  getCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from "../controllers/customers.controller";
import {
  addSubjectsHandler,
  listSubjectsHandler,
} from "../controllers/subjects.controller";
import { listCustomerJobsHandler } from "../controllers/jobs.controller";
import { requireAuth } from "../middleware/requireAuth";
import {
  validateInput,
  validateParams,
  validateQuery,
} from "../middleware/validation.middleware";
import {
  createCustomerSchema,
  listItemsQuerySchema,
  updateCustomerSchema,
} from "../validations/customers.validation";
import { idParamsSchema } from "../validations/params.validation";
import { createSubjectSchema } from "../validations/subjects.validation";

const router = Router();

router.get(
  "/",
  requireAuth,
  validateQuery(listItemsQuerySchema),
  listCustomersHandler,
);

router.post(
  "/",
  requireAuth,
  validateInput(createCustomerSchema),
  createCustomerHandler,
);

router.get(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  getCustomerHandler,
);

router.patch(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(updateCustomerSchema),
  updateCustomerHandler,
);

router.get(
  "/:id/subjects",
  requireAuth,
  validateParams(idParamsSchema),
  listSubjectsHandler,
);

router.post(
  "/:id/subjects",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(createSubjectSchema),
  addSubjectsHandler,
);

router.get(
  "/:id/jobs",
  requireAuth,
  validateQuery(listItemsQuerySchema),
  validateParams(idParamsSchema),
  listCustomerJobsHandler,
);

export default router;
