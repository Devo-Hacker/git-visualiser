import { supabaseAdmin } from "../lib/supabase.js";

const unauthenticated = (res, message) =>
  res.status(401).json({ error: { code: "UNAUTHENTICATED", message } });

// Verifies the Supabase access token sent as "Authorization: Bearer <token>".
// On success, sets req.user = { id, email }.
export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return unauthenticated(res, "Missing bearer token");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return unauthenticated(res, "Invalid or expired token");
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}
