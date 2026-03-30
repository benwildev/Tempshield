import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { db, usersTable, apiUsageTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function createTestUser(suffix: string) {
  const email = `check-${suffix}-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Check User", email, password: "testpass123" });
  return { email, user: res.body.user, cookies: res.headers["set-cookie"] as string[] };
}

async function cleanupUser(email: string) {
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (u) {
    await db.delete(apiUsageTable).where(eq(apiUsageTable.userId, u.id));
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
  }
}

describe("POST /api/check-email", () => {
  let email: string;
  let apiKey: string;
  let cookies: string[];

  beforeEach(async () => {
    const test = await createTestUser("single");
    email = test.email;
    apiKey = test.user.apiKey;
    cookies = test.cookies;
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("returns a result for a valid email via API key", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ email: "test@gmail.com" });

    expect(res.status).toBe(200);
    expect(typeof res.body.isDisposable).toBe("boolean");
    expect(res.body.domain).toBe("gmail.com");
    expect(typeof res.body.reputationScore).toBe("number");
    expect(typeof res.body.requestsRemaining).toBe("number");
  });

  it("returns a result for a valid email via session", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .set("Cookie", cookies)
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.domain).toBe("example.com");
  });

  it("flags a known disposable domain", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ email: "throwaway@mailinator.com" });

    expect(res.status).toBe(200);
    expect(res.body.isDisposable).toBe(true);
    expect(res.body.reputationScore).toBeLessThan(50);
  });

  it("returns 401 with no auth", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid API key", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .set("Authorization", "Bearer ts_invalidkeyhere1234567890abcdef12")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid API key");
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await request(app)
      .post("/api/check-email")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ email: "not-a-valid-email" });
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post("/api/check-email")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ email: `test${i}@example.com` });
    }

    const res = await request(app)
      .post("/api/check-email")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ email: "over@limit.com" });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit/i);
  });
});

describe("POST /api/check-emails/bulk", () => {
  let email: string;
  let apiKey: string;

  beforeEach(async () => {
    const test = await createTestUser("bulk");
    email = test.email;
    apiKey = test.user.apiKey;

    await db.update(usersTable).set({ plan: "BASIC", requestLimit: 1000, requestCount: 0 }).where(eq(usersTable.email, email));
  });

  afterEach(async () => {
    await cleanupUser(email);
  });

  it("processes multiple emails in one request", async () => {
    const emails = ["test1@gmail.com", "throwaway@mailinator.com", "contact@company.org"];
    const res = await request(app)
      .post("/api/check-emails/bulk")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ emails });

    expect(res.status).toBe(200);
    expect(res.body.totalChecked).toBe(3);
    expect(res.body.results).toHaveLength(3);
    expect(typeof res.body.disposableCount).toBe("number");
    for (const result of res.body.results) {
      expect(result).toHaveProperty("email");
      expect(result).toHaveProperty("isDisposable");
      expect(result).toHaveProperty("reputationScore");
    }
  });

  it("returns 403 for FREE plan users", async () => {
    const freeEmail = `free-bulk-${Date.now()}@example.com`;
    const freeRes = await request(app)
      .post("/api/auth/register")
      .send({ name: "Free User", email: freeEmail, password: "testpass123" });
    const freeApiKey = freeRes.body.user.apiKey;

    const res = await request(app)
      .post("/api/check-emails/bulk")
      .set("Authorization", `Bearer ${freeApiKey}`)
      .send({ emails: ["test@gmail.com"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/FREE plan/i);

    await cleanupUser(freeEmail);
  });

  it("returns 400 if emails array is empty", async () => {
    const res = await request(app)
      .post("/api/check-emails/bulk")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ emails: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 if more than 100 emails are submitted", async () => {
    const emails = Array.from({ length: 101 }, (_, i) => `user${i}@example.com`);
    const res = await request(app)
      .post("/api/check-emails/bulk")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ emails });
    expect(res.status).toBe(400);
  });

  it("returns 401 with no auth", async () => {
    const res = await request(app)
      .post("/api/check-emails/bulk")
      .send({ emails: ["test@example.com"] });
    expect(res.status).toBe(401);
  });
});
