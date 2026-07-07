import { describe, expect, it } from "bun:test";
import {
  SHELL_ENV_SECTION_END,
  SHELL_ENV_SECTION_START,
} from "@brains/utils/env-schema";
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

  it("bundles the generated shell-owned section for every model", () => {
    // The section between the markers is generated from shellEnvVars()
    // by scripts/sync-env-templates.ts; env-schema:check guards drift.
    const unavailableWorkspaceLookup = (): string => {
      throw new Error("workspace lookup unavailable");
    };
    for (const model of ["rover", "ranger", "relay"]) {
      const schema = resolveModelEnvSchema(model, unavailableWorkspaceLookup);
      const start = schema.indexOf(SHELL_ENV_SECTION_START);
      const end = schema.indexOf(SHELL_ENV_SECTION_END);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      expect(schema.slice(start, end)).toContain("AI_API_KEY=");
    }
  });
});
