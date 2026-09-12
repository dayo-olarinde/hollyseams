import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { globalError, notFound } from "./middleware/error.middleware";
import { apiLimiter } from "./middleware/rateLimiter.middleware";
import authRouter from "./routes/auth.routes";
import customersRouter from "./routes/customers.routes";
import healthRouter from "./routes/health.routes";
import jobsRouter from "./routes/jobs.routes";
import reportsRouter from "./routes/reports.routes";
import subjectsRouter from "./routes/subjects.routes";

export const app = express();

/**
 * Middleware ORDER matters in Express: each layer wraps the ones after it.
 * Security/parsing middleware goes first so every request (including ones
 * that end in 404) is covered; the routers come last, then the two
 * terminal middlewares (404 + error) that no route can fall past.
 */
app.use(helmet());
app.use(compression());
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
  }),
);
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use("/api", apiLimiter);

app.use("/", healthRouter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/customers", customersRouter);
app.use("/api/v1/subjects", subjectsRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/reports", reportsRouter);

app.use(notFound);
app.use(globalError);
