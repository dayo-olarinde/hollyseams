import { Router } from "express";
import { loginUserHandler, logoutUserHandler } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
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

router.post("/logout", requireAuth, logoutUserHandler);

export default router;
