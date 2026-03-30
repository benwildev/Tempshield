import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: mockLogin,
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
  useLocation: () => ["/login", mockNavigate],
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/AuthRightPanel", () => ({
  default: () => <div data-testid="auth-right-panel" />,
}));

import LoginPage from "@/pages/login";
import React from "react";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the email and password inputs", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("admin@tempshield.io")).toBeTruthy();
    expect(screen.getByPlaceholderText("••••••••")).toBeTruthy();
  });

  it("renders the sign in button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("renders a link to the signup page", () => {
    render(<LoginPage />);
    const signupLink = screen.getByRole("link", { name: /sign up/i });
    expect(signupLink).toBeTruthy();
    expect(signupLink.getAttribute("href")).toBe("/signup");
  });

  it("calls login with the entered credentials on submit", async () => {
    mockLogin.mockResolvedValue(undefined);
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("admin@tempshield.io");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@example.com");
    await userEvent.type(passwordInput, "mypassword");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "mypassword",
      });
    });
  });

  it("shows an error message when login fails", async () => {
    mockLogin.mockRejectedValue({ error: "Invalid email or password" });
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("admin@tempshield.io");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await userEvent.type(emailInput, "wrong@example.com");
    await userEvent.type(passwordInput, "wrongpass");
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeTruthy();
    });
  });
});
