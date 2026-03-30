import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthRightPanel from "@/components/AuthRightPanel";

describe("AuthRightPanel", () => {
  it("renders the TempShield brand name", () => {
    render(<AuthRightPanel />);
    expect(screen.getByText("TempShield")).toBeTruthy();
  });

  it("renders the Real-time detection feature", () => {
    render(<AuthRightPanel />);
    expect(screen.getByText("Real-time detection")).toBeTruthy();
  });

  it("renders the stat labels", () => {
    render(<AuthRightPanel />);
    expect(screen.getByText("Accuracy")).toBeTruthy();
    expect(screen.getByText("Response")).toBeTruthy();
    expect(screen.getByText("Domains")).toBeTruthy();
  });

  it("renders the stat values", () => {
    render(<AuthRightPanel />);
    expect(screen.getByText("99.9%")).toBeTruthy();
    expect(screen.getByText("<50ms")).toBeTruthy();
    expect(screen.getByText("100K+")).toBeTruthy();
  });

  it("renders all three feature items", () => {
    render(<AuthRightPanel />);
    const features = [
      "Real-time detection",
      "100K+ blocked domains",
      "Trusted by 10,000+ developers",
    ];
    for (const feature of features) {
      expect(screen.getByText(feature)).toBeTruthy();
    }
  });
});
