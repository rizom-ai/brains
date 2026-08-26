import { describe, expect, it } from "bun:test";
import {
  hasMatchingClientMetadataRedirectUri,
  matchesLoopbackDynamicPort,
} from "../src/redirect-uri";

describe("matchesLoopbackDynamicPort", () => {
  it("matches any port when the registration omits one", () => {
    // Claude Code's client ID metadata document, and the port it binds.
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost/callback",
        "http://localhost:54321/callback",
      ),
    ).toBe(true);
    expect(
      matchesLoopbackDynamicPort(
        "http://127.0.0.1/callback",
        "http://127.0.0.1:8976/callback",
      ),
    ).toBe(true);
  });

  it("refuses to substitute the loopback host", () => {
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost/callback",
        "http://127.0.0.1:54321/callback",
      ),
    ).toBe(false);
  });

  it("refuses a dynamic port when the registration pins one", () => {
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost:6274/callback",
        "http://localhost:54321/callback",
      ),
    ).toBe(false);
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost:80/callback",
        "http://localhost:54321/callback",
      ),
    ).toBe(false);
  });

  it("refuses a different path, query or scheme", () => {
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost/callback",
        "http://localhost:54321/other",
      ),
    ).toBe(false);
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost/callback",
        "http://localhost:54321/callback?next=/admin",
      ),
    ).toBe(false);
    expect(
      matchesLoopbackDynamicPort(
        "http://localhost/callback",
        "https://localhost:54321/callback",
      ),
    ).toBe(false);
    expect(
      matchesLoopbackDynamicPort(
        "https://localhost/callback",
        "https://localhost:54321/callback",
      ),
    ).toBe(false);
  });

  it("refuses a non-loopback host", () => {
    expect(
      matchesLoopbackDynamicPort(
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai:8443/api/mcp/auth_callback",
      ),
    ).toBe(false);
  });
});

describe("hasMatchingClientMetadataRedirectUri", () => {
  it("still requires an exact match for non-loopback URIs", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback"];
    expect(
      hasMatchingClientMetadataRedirectUri(
        registered,
        "https://claude.ai/api/mcp/auth_callback",
      ),
    ).toBe(true);
    expect(
      hasMatchingClientMetadataRedirectUri(
        registered,
        "https://claude.ai/api/mcp/auth_callback/../evil",
      ),
    ).toBe(false);
  });

  it("accepts a dynamic loopback port from the declared list", () => {
    expect(
      hasMatchingClientMetadataRedirectUri(
        ["http://localhost/callback", "http://127.0.0.1/callback"],
        "http://127.0.0.1:61234/callback",
      ),
    ).toBe(true);
  });
});
