import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Replace the real Supabase client so these tests need no database or network.
vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() }, from: vi.fn() },
}));

import { supabaseAdmin } from "../src/lib/supabase.js";
import { createApp } from "../src/app.js";

const profile = {
  id: "u1",
  display_name: "Nilad",
  avatar_url: null,
  role: "student",
  created_at: "2026-10-03T00:00:00Z",
};

const signedIn = () =>
  supabaseAdmin.auth.getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "n@example.com" } },
    error: null,
  });

const mockProfileQuery = (result) =>
  supabaseAdmin.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
  });

const getMe = (token) =>
  request(createApp()).get("/api/me").set("Authorization", token);

describe("GET /api/me", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects requests with no token", async () => {
    const res = await request(createApp()).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects a non-bearer scheme", async () => {
    const res = await getMe("Basic abc");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "bad jwt" },
    });
    const res = await getMe("Bearer nope");
    expect(res.status).toBe(401);
  });

  it("returns the profile for a valid token", async () => {
    signedIn();
    mockProfileQuery({ data: profile, error: null });
    const res = await getMe("Bearer good");
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("Nilad");
    expect(res.body.email).toBe("n@example.com");
    expect(supabaseAdmin.auth.getUser).toHaveBeenCalledWith("good");
  });

  it("returns 404 when the profile row is missing", async () => {
    signedIn();
    mockProfileQuery({ data: null, error: null });
    const res = await getMe("Bearer good");
    expect(res.status).toBe(404);
  });

  it("returns a safe 500 when the database errors", async () => {
    signedIn();
    mockProfileQuery({ data: null, error: new Error("db down") });
    const res = await getMe("Bearer good");
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Something went wrong");
  });
});
