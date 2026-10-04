import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(1),

    GITHUB_APP_ID: z.string().regex(/^\d+$/, "must be the numeric App ID"),
    GITHUB_APP_SLUG: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    // Local development: path to the .pem file. Production: the key itself in GITHUB_PRIVATE_KEY.
    GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
    GITHUB_PRIVATE_KEY: z.string().optional(),

    STATE_SECRET: z.string().min(32, "must be at least 32 characters"),
    FRONTEND_URL: z.string().url().default("http://localhost:3001"),
  })
  .refine((e) => e.GITHUB_PRIVATE_KEY || e.GITHUB_PRIVATE_KEY_PATH, {
    message: "Set GITHUB_PRIVATE_KEY_PATH (or GITHUB_PRIVATE_KEY)",
    path: ["GITHUB_PRIVATE_KEY_PATH"],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
