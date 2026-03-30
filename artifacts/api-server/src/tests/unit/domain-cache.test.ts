import { describe, it, expect, beforeAll } from "vitest";
import {
  isDisposableDomain,
  getCacheSize,
  getLastLoaded,
  loadDomainCache,
} from "../../lib/domain-cache.js";
import { db, domainsTable } from "@workspace/db";

beforeAll(async () => {
  await db
    .insert(domainsTable)
    .values([
      { domain: "mailinator.com", source: "test" },
      { domain: "guerrillamail.com", source: "test" },
      { domain: "tempmail.org", source: "test" },
    ])
    .onConflictDoNothing();
  await loadDomainCache();
});

describe("isDisposableDomain", () => {
  it("returns true for a known disposable domain", () => {
    expect(isDisposableDomain("mailinator.com")).toBe(true);
  });

  it("returns true for guerrillamail.com", () => {
    expect(isDisposableDomain("guerrillamail.com")).toBe(true);
  });

  it("returns false for a legitimate domain", () => {
    expect(isDisposableDomain("gmail.com")).toBe(false);
  });

  it("returns false for an unknown domain", () => {
    expect(isDisposableDomain("notadisposable-company.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDisposableDomain("MAILINATOR.COM")).toBe(true);
    expect(isDisposableDomain("Guerrillamail.Com")).toBe(true);
  });
});

describe("getCacheSize", () => {
  it("returns a positive number after loading", () => {
    expect(getCacheSize()).toBeGreaterThan(0);
  });
});

describe("getLastLoaded", () => {
  it("returns a Date after loading", () => {
    const last = getLastLoaded();
    expect(last).toBeInstanceOf(Date);
  });
});
