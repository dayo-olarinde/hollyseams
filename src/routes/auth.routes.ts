import { Router } from "express";
import { loginUserHandler } from "../controllers/login.controller";
import { loginLimiter } from "../middleware/rateLimiter.middleware";
import { validateInput } from "../middleware/validation.middleware";
import { loginSchema } from "../validations/login.validation";

const router = Router();

router.post(
  "/login",
  loginLimiter,
  validateInput(loginSchema),
  loginUserHandler,
);

export default router;
