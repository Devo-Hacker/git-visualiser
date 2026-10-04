import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (body, secret) =>
  createHmac("sha256", secret).update(body).digest();

// Creates a tamper-proof token: base64url(payload).base64url(signature)
export function signState(payload, secret, ttlMs = 10 * 60 * 1000, now = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + ttlMs })
  ).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

// Returns the payload if the signature is valid and not expired, otherwise null.
export function verifyState(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [body, sig] = parts;
  const expected = sign(body, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}
