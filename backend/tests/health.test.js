import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";

describe("API basics", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});