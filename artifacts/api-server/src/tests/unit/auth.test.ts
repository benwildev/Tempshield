import { describe, it, expect } from "vitest";
import { generateApiKey, hashPassword, verifyPassword, getRequestLimit } from "../../lib/auth.js";

describe("generateApiKey", () => {
  it("generates a key prefixed with ts_", () => {
    const key = generateApiKey();
    expect(key.startsWith("ts_")).toBe(true);
  });

  it("generates a key of the correct length (ts_ + 32 hex chars)", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^ts_[a-f0-9]{32}$/);
  });

  it("generates unique keys each time", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const password = "superSecret123!";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashPassword("correctPassword");
    const valid = await verifyPassword("wrongPassword", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for the same password (bcrypt salting)", async () => {
    const hash1 = await hashPassword("same");
    const hash2 = await hashPassword("same");
    expect(hash1).not.toBe(hash2);
  });
});

describe("getRequestLimit", () => {
  it("returns 10 for FREE plan", () => {
    expect(getRequestLimit("FREE")).toBe(10);
  });

  it("returns 1000 for BASIC plan", () => {
    expect(getRequestLimit("BASIC")).toBe(1000);
  });

  it("returns 10000 for PRO plan", () => {
    expect(getRequestLimit("PRO")).toBe(10000);
  });

  it("returns default 10 for unknown plan", () => {
    expect(getRequestLimit("CUSTOM_UNKNOWN")).toBe(10);
  });
});
