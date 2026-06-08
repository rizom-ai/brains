import { describe, expect, it } from "bun:test";
import { resolveModelEnvSchema } from "../src/lib/env-schema";

describe("env schema resolution", () => {
  it("uses bundled built-in schemas when workspace lookup is unavailable", () => {
    const unavailableWorkspaceLookup = (): string => {
      throw new Error("workspace lookup unavailable");
    };

    const roverSchema = resolveModelEnvSchema(
      "rover",
      unavailableWorkspaceLookup,
    );
    expect(roverSchema).toContain("AI_API_KEY=");
    expect(roverSchema).toContain("CMS_CONTENT_REPO_PAT=");
    expect(roverSchema).toContain("ATPROTO_APP_PASSWORD=");
    expect(roverSchema).not.toContain("ATPROTO_IDENTIFIER=");
    expect(
      resolveModelEnvSchema("ranger", unavailableWorkspaceLookup),
    ).toContain("LINKEDIN_ORGANIZATION_ID=");
    expect(
      resolveModelEnvSchema("relay", unavailableWorkspaceLookup),
    ).not.toContain("DISCORD_BOT_TOKEN=");
  });
});
