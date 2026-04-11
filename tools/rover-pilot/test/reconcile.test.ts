import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { onboardUser } from "../src/onboard-user";
import { reconcileAll } from "../src/reconcile-all";
import { reconcileCohort } from "../src/reconcile-cohort";
import type { ResolvedUser } from "../src/load-registry";

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
      `${user.handle}:${user.cohort}:${user.preset}:${user.brainVersion}`,
    );
  };
}

const baseFiles = {
  "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.12
model: rover
githubOrg: rizom-ai-pilot
repoPrefix: rover-
contentRepoSuffix: -content
domainSuffix: .rover.example.com
preset: core
`,
  "users/alice.yaml": `handle: alice
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
`,
  "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.13
presetOverride: pro
members:
  - bob
  - alice
`,
  "cohorts/steady.yaml": `members:
  - cara
`,
} satisfies Record<string, string>;

describe("reconcile scripts", () => {
  it("onboardUser resolves one user and refreshes users table", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    await onboardUser(root, "alice", createRunner(calls));

    expect(calls).toEqual(["alice:canary:pro:0.1.1-alpha.13"]);

    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| alice | canary | rover | pro | 0.1.1-alpha.13 |",
    );
  });

  it("reconcileCohort runs only users in target cohort, sorted by handle", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    await reconcileCohort(root, "canary", createRunner(calls));

    expect(calls).toEqual([
      "alice:canary:pro:0.1.1-alpha.13",
      "bob:canary:pro:0.1.1-alpha.13",
    ]);
  });

  it("reconcileAll runs all users once, sorted by handle", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    await reconcileAll(root, createRunner(calls));

    expect(calls).toEqual([
      "alice:canary:pro:0.1.1-alpha.13",
      "bob:canary:pro:0.1.1-alpha.13",
      "cara:steady:core:0.1.1-alpha.12",
    ]);
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
