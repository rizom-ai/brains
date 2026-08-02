import { describe, expect, it } from "bun:test";

import { createDefaultUserRunner } from "../src/default-user-runner";
import type { ResolvedUser } from "../src/load-registry";

const baseUser: ResolvedUser = {
  anchorProfile: {
    name: "Rizom Work",
  },
  brainVersion: "0.2.0-alpha.136",
  cohort: "sites",
  contentRepo: "rizom-ai/rizom-ai-content",
  deployStatus: "unknown",
  discordEnabled: false,
  dnsStatus: "unknown",
  domain: "rizom.ai",
  effectiveAiApiKey: "AI_API_KEY",
  effectiveGitSyncToken: "GIT_SYNC_TOKEN",
  handle: "rizom-ai",
  mcpStatus: "unknown",
  bundles: ["core", "site", "publishing"],
  add: ["docs"],
  remove: [],
  serverStatus: "unknown",
  siteOverride: {
    package: "@rizom/site-rizom-ai",
    version: "0.2.0-alpha.136",
    theme: "@brains/theme-rizom",
  },
  snapshotStatus: "missing",
};

describe("createDefaultUserRunner", () => {
  it("renders site package refs while keeping site version out of brain.yaml", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner(baseUser);

    expect(result.brainYaml).toContain("brain: brain");
    expect(result.brainYaml).toContain("kind: professional");
    expect(result.brainYaml).toContain(
      "bundles:\n  - core\n  - site\n  - publishing",
    );
    expect(result.brainYaml).toContain(`add:\n  - docs`);
    expect(result.brainYaml).toContain(
      `site:\n  package: "@rizom/site-rizom-ai"\n  theme: "@brains/theme-rizom"`,
    );
    expect(result.brainYaml).not.toContain("0.2.0-alpha.136");
    expect(result.brainYaml).toContain(
      `directory-sync:\n    git:\n      repo: rizom-ai/rizom-ai-content`,
    );
    expect(result.envFile).toContain("CONTENT_REPO=rizom-ai/rizom-ai-content");
    expect(result.contentRepoFiles?.[0]?.content).not.toContain("kind:");
  });

  it("renders the composition profile kind from the user override", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner({ ...baseUser, profileKind: "collective" });

    expect(result.brainYaml).toContain("kind: collective");
    expect(result.brainYaml).not.toContain("kind: professional");
  });

  it("renders the atproto block with the owner's account DID for handle verification", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner({
      ...baseUser,
      atproto: {
        identifier: "did:plc:oehciuqunzskplljt3qnnncw",
        accountDid: "did:plc:oehciuqunzskplljt3qnnncw",
        lexiconAuthority: true,
      },
    });

    expect(result.brainYaml).toContain(
      "  atproto:\n" +
        "    identifier: did:plc:oehciuqunzskplljt3qnnncw\n" +
        "    accountDid: did:plc:oehciuqunzskplljt3qnnncw\n" +
        "    lexiconAuthority: true\n" +
        "    appPassword: ${ATPROTO_APP_PASSWORD}",
    );
  });

  it("renders the atproto block without accountDid when not configured", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner({
      ...baseUser,
      atproto: { identifier: "rizom.bsky.social" },
    });

    expect(result.brainYaml).toContain(
      "  atproto:\n" +
        "    identifier: rizom.bsky.social\n" +
        "    appPassword: ${ATPROTO_APP_PASSWORD}",
    );
    expect(result.brainYaml).not.toContain("accountDid");
    expect(result.brainYaml).not.toContain("lexiconAuthority");
  });

  it("renders an opt-in Jetstream canary block", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner({
      ...baseUser,
      atproto: {
        identifier: "rizom.bsky.social",
        jetstream: {
          enabled: true,
          queueLimit: 64,
          concurrency: 2,
        },
      },
    });

    expect(result.brainYaml).toContain(
      "    jetstream:\n" +
        "      concurrency: 2\n" +
        "      enabled: true\n" +
        "      queueLimit: 64",
    );
  });

  it("preserves an explicit false lexicon authority setting", async () => {
    const runner = createDefaultUserRunner("rizom-ai");

    const result = await runner({
      ...baseUser,
      atproto: {
        identifier: "rizom.bsky.social",
        lexiconAuthority: false,
      },
    });

    expect(result.brainYaml).toContain("    lexiconAuthority: false");
  });
});
