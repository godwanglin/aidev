import { describe, expect, test } from "bun:test"
import { isAllowedAuthorizationRedirect } from "./auth-redirect"

describe("authorization redirect validation", () => {
  test("allows registered AidevCLI callbacks", () => {
    expect(isAllowedAuthorizationRedirect("app", "https://aidev_cli.ai/auth/callback")).toBe(true)
    expect(isAllowedAuthorizationRedirect("app", "https://dev.aidev_cli.ai/auth/callback")).toBe(true)
    expect(isAllowedAuthorizationRedirect("app", "http://localhost:3000/auth/callback")).toBe(true)
    expect(isAllowedAuthorizationRedirect("app", "http://127.0.0.1:3000/auth/callback")).toBe(true)
  })

  test("rejects unregistered clients and external redirects", () => {
    expect(isAllowedAuthorizationRedirect("other", "https://aidev_cli.ai/auth/callback")).toBe(false)
    expect(isAllowedAuthorizationRedirect("app", "https://evil.example/callback")).toBe(false)
    expect(isAllowedAuthorizationRedirect("app", "https://aidev_cli.ai.evil.example/callback")).toBe(false)
    expect(isAllowedAuthorizationRedirect("app", "javascript:alert(1)")).toBe(false)
  })
})
