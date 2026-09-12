import { Router } from "express";
import {
  loginUserHandler,
  logoutUserHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { loginLimiter } from "../middleware/rateLimiter.middleware";
import { validateInput } from "../middleware/validation.middleware";
import { loginSchema } from "../validations/login.validation";

const router = Router();

// loginLimiter runs BEFORE validation on purpose: a garbage-PIN flood is
// stopped at the rate limiter without spending any argon2 time.
router.post(
  "/login",
  loginLimiter,
  validateInput(loginSchema),
  loginUserHandler,
);

// Logout requires a valid session — logging out without one is a no-op
// that still clears the cookie.
router.post("/logout", requireAuth, logoutUserHandler);

export default router;
