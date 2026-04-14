import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ResolvedUser } from "../src/load-registry";
import { onboardUser } from "../src/onboard-user";
import { reconcileAll } from "../src/reconcile-all";
import { reconcileCohort } from "../src/reconcile-cohort";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rover-pilot-reconcile-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createRunner(calls: string[]): (user: ResolvedUser) => Promise<void> {
  return async (user: ResolvedUser): Promise<void> => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.preset}:${user.brainVersion}:${user.effectiveAiApiKey}:${user.effectiveGitSyncToken}:${user.effectiveMcpAuthToken}`,
    );
  };
}

function createSnapshotRunner(
  calls: string[],
): (user: ResolvedUser) => Promise<{ brainYaml: string }> {
  return async (user: ResolvedUser): Promise<{ brainYaml: string }> => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.preset}:${user.brainVersion}:${user.effectiveAiApiKey}:${user.effectiveGitSyncToken}:${user.effectiveMcpAuthToken}`,
    );

    return {
      brainYaml: `brain: ${user.model}\npreset: ${user.preset}\ndomain: ${user.domain}\n`,
    };
  };
}

const baseFiles = {
  "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1testpublickey
`,
  "users/alice.yaml": `handle: alice
anchorProfile:
  name: Alice Example
  description: Researcher and writer

discord:
  enabled: false
`,
  "users/bob.yaml": `handle: bob
discord:
  enabled: true
`,
  "users/cara.yaml": `handle: cara
discord:
  enabled: false
aiApiKeyOverride: CARA_AI_API_KEY
gitSyncTokenOverride: CARA_GIT_SYNC_TOKEN
mcpAuthTokenOverride: CARA_MCP_AUTH_TOKEN
`,
  "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.15
presetOverride: default
aiApiKeyOverride: CANARY_AI_API_KEY
mcpAuthTokenOverride: CANARY_MCP_AUTH_TOKEN
members:
  - bob
  - alice
`,
  "cohorts/steady.yaml": `members:
  - cara
`,
} satisfies Record<string, string>;

describe("reconcile scripts", () => {
  it("onboardUser uses the default runner and refreshes users table", async () => {
    const root = await createPilotRepo(baseFiles);

    await onboardUser(root, "alice");

    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: rover\ndomain: alice.rizom.ai\npreset: default\n\nanchors: []\n\nplugins:\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n  mcp:\n    authToken: ${MCP_AUTH_TOKEN}\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.15\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
    );
    const anchorProfile = await readFile(
      join(root, "users/alice/content/anchor-profile/anchor-profile.md"),
      "utf8",
    );
    expect(anchorProfile).toContain("kind: professional");
    expect(anchorProfile).toContain("name: Alice Example");
    expect(anchorProfile).toContain("description: Researcher and writer");
    expect(anchorProfile).toContain(
      "This profile was initialized by brains-ops. Edit it in your content repo.",
    );

    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| alice | canary | rover | default | 0.1.1-alpha.15 |",
    );
  });

  it("renders discord anchor user IDs into generated brain config", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/bob.yaml": `handle: bob\ndiscord:\n  enabled: true\n  anchorUserId: "123456789"\n`,
    });

    await onboardUser(root, "bob");

    expect(
      await readFile(join(root, "users/bob/brain.yaml"), "utf8"),
    ).toContain('anchors: ["discord:123456789"]');
  });

  it("reconcileCohort runs only users in target cohort, sorted by handle", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    await reconcileCohort(root, "canary", createRunner(calls));

    expect(calls).toEqual([
      "alice:canary:default:0.1.1-alpha.15:CANARY_AI_API_KEY:GIT_SYNC_TOKEN:CANARY_MCP_AUTH_TOKEN",
      "bob:canary:default:0.1.1-alpha.15:CANARY_AI_API_KEY:GIT_SYNC_TOKEN:CANARY_MCP_AUTH_TOKEN",
    ]);
  });

  it("reconcileAll uses the default runner for every user", async () => {
    const root = await createPilotRepo(baseFiles);

    await reconcileAll(root);

    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toContain(
      "BRAIN_VERSION=0.1.1-alpha.15",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-alice-content",
    );
    expect(await readFile(join(root, "users/bob/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-bob-content",
    );
    expect(await readFile(join(root, "users/cara/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-cara-content",
    );
  });

  it("onboardUser fails for unknown handle", async () => {
    const root = await createPilotRepo(baseFiles);

    try {
      await onboardUser(root, "zoe");
      expect.unreachable("expected onboardUser to fail");
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Unknown user handle: zoe");
    }
  });

  it("writes brain.yaml snapshot when runner returns one", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    await onboardUser(root, "cara", createSnapshotRunner(calls));

    expect(calls).toEqual([
      "cara:steady:core:0.1.1-alpha.14:CARA_AI_API_KEY:CARA_GIT_SYNC_TOKEN:CARA_MCP_AUTH_TOKEN",
    ]);

    const snapshot = await readFile(
      join(root, "users/cara/brain.yaml"),
      "utf8",
    );
    expect(snapshot).toBe(
      "brain: rover\npreset: core\ndomain: cara.rizom.ai\n",
    );
    expect(await readFile(join(root, "users/cara/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=rizom-ai/rover-cara-content\n",
    );

    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| cara | steady | rover | core | 0.1.1-alpha.14 | cara.rizom.ai | rover-cara-content | off | unknown | unknown | unknown | unknown |",
    );
  });

  it("keeps hyphenated handles in generated content repo paths", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1testpublickey
`,
      "users/mary-jane.yaml": `handle: mary-jane\ndiscord:\n  enabled: true\n`,
      "cohorts/canary.yaml": `members:\n  - mary-jane\n`,
    });

    await onboardUser(root, "mary-jane");

    expect(
      await readFile(join(root, "users/mary-jane/brain.yaml"), "utf8"),
    ).toContain("repo: rizom-ai/rover-mary-jane-content");
    expect(await readFile(join(root, "users/mary-jane/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=rizom-ai/rover-mary-jane-content\n",
    );
    expect(
      await readFile(
        join(root, "users/mary-jane/content/anchor-profile/anchor-profile.md"),
        "utf8",
      ),
    ).toContain("name: Mary Jane");
  });

  it("reconcileCohort fails for unknown cohort", async () => {
    const root = await createPilotRepo(baseFiles);

    try {
      await reconcileCohort(root, "beta");
      expect.unreachable("expected reconcileCohort to fail");
    } catch (error) {
      expect(getErrorMessage(error)).toContain("Unknown cohort: beta");
    }
  });
});
