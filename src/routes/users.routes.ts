import { Router } from "express";
import {
  createUserHandler,
  listUsersHandler,
} from "../controllers/users.controller";
import { validateInput } from "../middleware/validationMiddleware";
import { createUserSchema } from "../validations/user.validation";

const router = Router();

router.post("/", validateInput(createUserSchema), createUserHandler);
router.get("/", listUsersHandler);

export default router;
