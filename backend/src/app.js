import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { notFound, errorHandler } from "./middleware/errors.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors()); // we'll restrict this to the frontend's origin later
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/me", meRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
