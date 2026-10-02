import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();
const server = app.listen(env.PORT, () =>
  logger.info(`API listening on port ${env.PORT}`)
);

function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
["SIGINT", "SIGTERM"].forEach((s) => process.on(s, () => shutdown(s)));