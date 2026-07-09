import { describe, expect, it } from "bun:test";

import { createDefaultUserRunner } from "../src/default-user-runner";
import type { ResolvedUser } from "../src/load-registry";

const baseUser: ResolvedUser = {
  anchorProfile: {
    name: "Rizom Work",
  },
  brainVersion: "0.2.0-alpha.136",
  cohort: "sites",
  contentRepo: "rizom-ai/rizom-work-content",
  deployStatus: "unknown",
  discordEnabled: false,
  dnsStatus: "unknown",
  domain: "rizom.work",
  effectiveAiApiKey: "AI_API_KEY",
  effectiveGitSyncToken: "GIT_SYNC_TOKEN",
  handle: "rizom-work",
  mcpStatus: "unknown",
  model: "rover",
  preset: "default",
  serverStatus: "unknown",
  addOverride: ["docs"],
  siteOverride: {
    package: "@rizom/site-rizom-work",
    version: "0.2.0-alpha.136",
    theme: "@brains/theme-rizom",
  },
  snapshotStatus: "missing",
};

describe("createDefaultUserRunner", () => {
  it("renders site package refs while keeping site version out of brain.yaml", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner(baseUser);

    expect(result.brainYaml).toContain(`add:\n  - docs`);
    expect(result.brainYaml).toContain(
      `site:\n  package: "@rizom/site-rizom-work"\n  theme: "@brains/theme-rizom"`,
    );
    expect(result.brainYaml).not.toContain("0.2.0-alpha.136");
    expect(result.brainYaml).toContain(
      `directory-sync:\n    git:\n      repo: rizom-ai/rizom-work-content`,
    );
    expect(result.envFile).toContain(
      "CONTENT_REPO=rizom-ai/rizom-work-content",
    );
  });
});
