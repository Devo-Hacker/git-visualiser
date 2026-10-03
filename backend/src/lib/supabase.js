import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Admin client: uses the secret key, so it BYPASSES row-level security.
// Server-side only. Always filter by the authenticated user's id yourself.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
