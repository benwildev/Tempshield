import { describe, it, expect } from "vitest";
import { computeReputationScore, type ReputationChecks } from "../../lib/reputation.js";

describe("computeReputationScore", () => {
  it("returns 100 for a clean, non-disposable, non-free domain with MX and inbox", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: true,
      hasInbox: true,
      domain: "mycompany.com",
    };
    expect(computeReputationScore(checks)).toBe(100);
  });

  it("subtracts 60 for a disposable domain", () => {
    const checks: ReputationChecks = {
      isDisposable: true,
      hasMx: true,
      hasInbox: true,
      domain: "mycompany.com",
    };
    expect(computeReputationScore(checks)).toBe(40);
  });

  it("subtracts 20 for missing MX records", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: false,
      hasInbox: true,
      domain: "mycompany.com",
    };
    expect(computeReputationScore(checks)).toBe(80);
  });

  it("subtracts 15 for missing inbox support", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: true,
      hasInbox: false,
      domain: "mycompany.com",
    };
    expect(computeReputationScore(checks)).toBe(85);
  });

  it("subtracts 5 for a free email provider (gmail.com)", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: true,
      hasInbox: true,
      domain: "gmail.com",
    };
    expect(computeReputationScore(checks)).toBe(95);
  });

  it("is case-insensitive for free provider check", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: true,
      hasInbox: true,
      domain: "GMAIL.COM",
    };
    expect(computeReputationScore(checks)).toBe(95);
  });

  it("treats undefined hasMx as not penalized", () => {
    const checks: ReputationChecks = {
      isDisposable: false,
      hasMx: undefined,
      hasInbox: undefined,
      domain: "mycompany.com",
    };
    expect(computeReputationScore(checks)).toBe(100);
  });

  it("accumulates multiple penalties: disposable + no MX + free provider", () => {
    const checks: ReputationChecks = {
      isDisposable: true,
      hasMx: false,
      hasInbox: true,
      domain: "yahoo.com",
    };
    expect(computeReputationScore(checks)).toBe(15);
  });

  it("floors at 0 and never goes negative", () => {
    const checks: ReputationChecks = {
      isDisposable: true,
      hasMx: false,
      hasInbox: false,
      domain: "gmail.com",
    };
    expect(computeReputationScore(checks)).toBe(0);
  });

  it("recognises all standard free providers", () => {
    const freeProviders = [
      "yahoo.com", "hotmail.com", "outlook.com", "live.com",
      "icloud.com", "aol.com", "protonmail.com", "proton.me",
      "zoho.com", "yandex.com", "mail.com", "gmx.com",
      "fastmail.com", "tutanota.com", "hey.com", "msn.com",
      "me.com", "mac.com", "pm.me",
    ];
    for (const domain of freeProviders) {
      const score = computeReputationScore({
        isDisposable: false,
        hasMx: true,
        hasInbox: true,
        domain,
      });
      expect(score, `expected 95 for ${domain}`).toBe(95);
    }
  });
});
