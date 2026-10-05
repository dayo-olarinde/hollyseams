import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Logger, RequestMethod } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { API_PREFIX, HEALTH_PATH } from "./common/http/routes";
import { ENV, type Env } from "./config/env.schema";

export const createHttpAdapter = (): FastifyAdapter =>
  new FastifyAdapter({
    logger: false,
    trustProxy: false,
    routerOptions: { ignoreTrailingSlash: true }, // Treat `/customers` and `/customers/` as the same route.
  });

const httpLogger = new Logger("HTTP");
const logRequest = (request: FastifyRequest, reply: FastifyReply): void => {
  const line = `${request.method} ${request.url} ${reply.statusCode} - ${reply.elapsedTime.toFixed(1)}ms`;

  if (reply.statusCode >= 500) httpLogger.error(line);
  else if (reply.statusCode >= 400) httpLogger.warn(line);
  else httpLogger.log(line);
};

export const configureApp = async (
  app: NestFastifyApplication,
): Promise<void> => {
  const env = app.get<Env>(ENV);

  await app.register(helmet);
  await app.register(compress);
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(cookie);

  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;

  fastify.addHook("onResponse", (request, reply, done) => {
    if (request.url.split("?")[0] !== HEALTH_PATH) logRequest(request, reply);
    done();
  });

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
};
