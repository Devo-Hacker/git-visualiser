import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const meRouter = Router();

// Returns the signed-in user's profile.
meRouter.get("/", requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url, role, created_at")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Profile not found" } });
  }
  res.json({ ...data, email: req.user.email });
});
