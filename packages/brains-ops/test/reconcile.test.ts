import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ResolvedUser } from "../src/load-registry";
import { onboardUser } from "../src/onboard-user";
import { reconcileAll } from "../src/reconcile-all";
import { reconcileCohort } from "../src/reconcile-cohort";

async function createPilotRepo(files: Record<string, string>) {
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

function createRunner(calls: string[]) {
  return async (user: ResolvedUser) => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.preset}:${user.brainVersion}:${user.effectiveAiApiKey}`,
    );
  };
}

function createSnapshotRunner(calls: string[]) {
  return async (user: ResolvedUser) => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.preset}:${user.brainVersion}:${user.effectiveAiApiKey}`,
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
`,
  "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.15
presetOverride: default
aiApiKeyOverride: CANARY_AI_API_KEY
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
      "BRAIN_VERSION=0.1.1-alpha.15\nAI_API_KEY_SECRET=CANARY_AI_API_KEY\nGIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_ALICE\nMCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_ALICE\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
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
      "users/bob.yaml": `handle: bob
discord:
  enabled: true
  anchorUserId: "123456789"
`,
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
      "alice:canary:default:0.1.1-alpha.15:CANARY_AI_API_KEY",
      "bob:canary:default:0.1.1-alpha.15:CANARY_AI_API_KEY",
    ]);
  });

  it("reconcileAll uses the default runner for every user", async () => {
    const root = await createPilotRepo(baseFiles);

    await reconcileAll(root);

    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toContain(
      "BRAIN_VERSION=0.1.1-alpha.15",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toContain(
      "AI_API_KEY_SECRET=CANARY_AI_API_KEY",
    );
    expect(await readFile(join(root, "users/bob/.env"), "utf8")).toContain(
      "DISCORD_BOT_TOKEN_SECRET=DISCORD_BOT_TOKEN_BOB",
    );
    expect(await readFile(join(root, "users/cara/.env"), "utf8")).toContain(
      "AI_API_KEY_SECRET=CARA_AI_API_KEY",
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

    expect(calls).toEqual(["cara:steady:core:0.1.1-alpha.14:CARA_AI_API_KEY"]);

    const snapshot = await readFile(
      join(root, "users/cara/brain.yaml"),
      "utf8",
    );
    expect(snapshot).toBe(
      "brain: rover\npreset: core\ndomain: cara.rizom.ai\n",
    );
    expect(await readFile(join(root, "users/cara/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nAI_API_KEY_SECRET=CARA_AI_API_KEY\nGIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_CARA\nMCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_CARA\nCONTENT_REPO=rizom-ai/rover-cara-content\n",
    );

    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| cara | steady | rover | core | 0.1.1-alpha.14 | cara.rizom.ai | rover-cara-content | off | unknown | unknown | unknown | unknown |",
    );
  });

  it("normalizes hyphenated handles in generated secret selector names", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
`,
      "users/mary-jane.yaml": `handle: mary-jane
discord:
  enabled: true
`,
      "cohorts/canary.yaml": `members:
  - mary-jane
`,
    });

    await onboardUser(root, "mary-jane");

    expect(
      await readFile(join(root, "users/mary-jane/brain.yaml"), "utf8"),
    ).toContain("repo: rizom-ai/rover-mary-jane-content");
    expect(await readFile(join(root, "users/mary-jane/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nAI_API_KEY_SECRET=AI_API_KEY\nGIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_MARY_JANE\nMCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_MARY_JANE\nDISCORD_BOT_TOKEN_SECRET=DISCORD_BOT_TOKEN_MARY_JANE\nCONTENT_REPO=rizom-ai/rover-mary-jane-content\n",
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
