import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { globalError, notFound } from "./middleware/errorMiddleware";
import { apiLimiter } from "./middleware/rateLimiter.middleware";
import healthRouter from "./routes/health.routes";
import usersRouter from "./routes/users.routes";

export const app = express();

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
app.use("/api/v1/users", usersRouter);

app.use(notFound);
app.use(globalError);
