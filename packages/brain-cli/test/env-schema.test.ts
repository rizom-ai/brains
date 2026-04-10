import { describe, expect, it } from "bun:test";
import { resolveModelEnvSchema } from "../src/lib/env-schema";

describe("env schema resolution", () => {
  it("uses bundled built-in schemas when workspace lookup is unavailable", () => {
    const unavailableWorkspaceLookup = (): string => {
      throw new Error("workspace lookup unavailable");
    };

    expect(
      resolveModelEnvSchema("rover", unavailableWorkspaceLookup),
    ).toContain("AI_API_KEY=");
    expect(
      resolveModelEnvSchema("ranger", unavailableWorkspaceLookup),
    ).toContain("LINKEDIN_ORGANIZATION_ID=");
    expect(
      resolveModelEnvSchema("relay", unavailableWorkspaceLookup),
    ).toContain("MCP_AUTH_TOKEN=");
  });
});
