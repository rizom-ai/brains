import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ResolvedUser } from "../src/load-registry";
import { onboardUser } from "../src/onboard-user";
import { reconcileAll } from "../src/reconcile-all";
import { dryRunReconcileAll } from "../src/reconcile-dry-run";
import { reconcileCohort } from "../src/reconcile-cohort";
import { writeUsersTable } from "../src/render-users-table";
import { getErrorMessage } from "@brains/utils/error";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("rover-pilot-reconcile-");

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

function createRunner(calls: string[]): (user: ResolvedUser) => Promise<void> {
  return async (user: ResolvedUser): Promise<void> => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.bundles.join(",")}:${user.brainVersion}:${user.effectiveAiApiKey}:${user.effectiveGitSyncToken}`,
    );
  };
}

function createSnapshotRunner(
  calls: string[],
): (user: ResolvedUser) => Promise<{ brainYaml: string }> {
  return async (user: ResolvedUser): Promise<{ brainYaml: string }> => {
    calls.push(
      `${user.handle}:${user.cohort}:${user.bundles.join(",")}:${user.brainVersion}:${user.effectiveAiApiKey}:${user.effectiveGitSyncToken}`,
    );

    const bundles = user.bundles.map((bundle) => `  - ${bundle}`).join("\n");
    return {
      brainYaml: `brain: brain\nbundles:\n${bundles}\ndomain: ${user.domain}\n`,
    };
  };
}

const baseFiles = {
  "pilot.yaml": `brainVersion: 0.1.1-alpha.14
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
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
`,
  "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.15
bundlesOverride:
  - core
  - site
  - publishing
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
  it("dry-runs in an isolated copy with external access blocked and converges", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      ".env":
        "GIT_SYNC_TOKEN=must-not-be-used\nCONTENT_REPO_ADMIN_TOKEN=must-not-be-used\n",
      "users/alice.secrets.yaml": "discordBotToken: must-not-be-copied\n",
    });
    const pilotBefore = await readFile(join(root, "pilot.yaml"), "utf8");

    const result = await dryRunReconcileAll(root);

    expect(result.firstPassChangedFiles).toContain("users/alice/brain.yaml");
    expect(result.secondPassChangedFiles).toEqual([]);
    expect(await Bun.file(join(root, "users/alice/brain.yaml")).exists()).toBe(
      false,
    );
    expect(await readFile(join(root, "pilot.yaml"), "utf8")).toBe(pilotBefore);
  });

  it("reports zero first- and second-pass drift for reconciled input", async () => {
    const root = await createPilotRepo(baseFiles);
    await reconcileAll(root, undefined, { env: {} });

    const result = await dryRunReconcileAll(root);

    expect(result).toEqual({
      firstPassChangedFiles: [],
      secondPassChangedFiles: [],
    });
  });

  it("preserves the observed users table across post-render reconciliation", async () => {
    const root = await createPilotRepo(baseFiles);
    await reconcileAll(root, undefined, { env: {} });
    await writeUsersTable(root, {
      resolveStatus(user) {
        return Promise.resolve(
          user.handle === "alice"
            ? {
                serverStatus: "ready",
                deployStatus: "ready",
                dnsStatus: "ready",
                mcpStatus: "ready",
              }
            : undefined,
        );
      },
    });
    const observedTable = await readFile(join(root, "views/users.md"), "utf8");

    await reconcileAll(root, undefined, { env: {} });
    const dryRun = await dryRunReconcileAll(root);

    expect(await readFile(join(root, "views/users.md"), "utf8")).toBe(
      observedTable,
    );
    expect(dryRun).toEqual({
      firstPassChangedFiles: [],
      secondPassChangedFiles: [],
    });
  });

  it("onboardUser uses the default runner without rewriting the observed users table", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "views/users.md": "observed fleet status\n",
    });

    await onboardUser(root, "alice");

    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nkind: professional\ndomain: alice.rizom.ai\nbundles:\n  - core\n  - site\n  - publishing\n\nanchors: []\n\nplugins:\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.15\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
    );
    const anchorProfile = await readFile(
      join(root, "users/alice/content/anchor-profile/anchor-profile.md"),
      "utf8",
    );
    expect(anchorProfile).not.toContain("kind:");
    expect(anchorProfile).toContain("name: Alice Example");
    expect(anchorProfile).toContain("description: Researcher and writer");
    expect(anchorProfile).toContain(
      "This profile was initialized by brains-ops. Edit it in your content repo.",
    );

    expect(await readFile(join(root, "views/users.md"), "utf8")).toBe(
      "observed fleet status\n",
    );
  });

  it("renders setup email delivery config into generated brain config", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/alice.yaml": `handle: alice
setup:
  delivery: email
  email: alice@example.com
discord:
  enabled: false
`,
    });

    await onboardUser(root, "alice");

    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nkind: professional\ndomain: alice.rizom.ai\nbundles:\n  - core\n  - site\n  - publishing\n\nanchors: []\n\nplugins:\n  auth-service:\n    setupEmail:\n      to: alice@example.com\n      subject: Welcome to Rover — set up your passkey\n      body: |\n        Hi,\n\n        Your Rover is ready.\n\n        Rover is your own AI — a private assistant deployed just for you, that holds your notes, links, and ideas, and gets more useful the more you put into it.\n\n        Set up your passkey:\n        {{setupUrl}}\n\n        This link is single-use. Do not forward it.\n        It expires at {{expiresAt}}.\n\n        After setup, open your chat and say hello:\n        {{origin}}/chat\n\n        Sign in with the passkey you just registered. The chat in your browser is where you and Rover will spend most of your time.\n\n        The onboarding guide shows the way of working — capture, ask back, shape:\n        https://github.com/rizom-ai/brains/blob/main/packages/brains-ops/templates/rover-pilot/docs/user-onboarding.md\n\n        If this link is expired, does not work, or you did not expect this email, reply to your Rover operator and we will help.\n  notifications:\n    defaultRecipient:\n      type: email\n      address: alice@example.com\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n  email:\n    transport: resend\n    apiKey: ${SETUP_EMAIL_API_KEY}\n    from: ${SETUP_EMAIL_FROM}\n",
    );
  });

  it("renders onboarding plugin config into generated brain config", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/alice.yaml": `handle: alice
playbooks:
  onboarding: true
discord:
  enabled: false
`,
    });

    await onboardUser(root, "alice");

    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nkind: professional\ndomain: alice.rizom.ai\nbundles:\n  - core\n  - site\n  - publishing\n\nanchors: []\n\nplugins:\n  onboarding:\n    enabled: true\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n",
    );
  });

  it("renders ATProto identifier config into generated brain config", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/alice.yaml": `handle: alice
atproto:
  identifier: rizom-test.bsky.social
discord:
  enabled: false
`,
    });

    await onboardUser(root, "alice");

    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nkind: professional\ndomain: alice.rizom.ai\nbundles:\n  - core\n  - site\n  - publishing\n\nanchors: []\n\nplugins:\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n  atproto:\n    identifier: rizom-test.bsky.social\n    appPassword: ${ATPROTO_APP_PASSWORD}\n",
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
      "alice:canary:core,site,publishing:0.1.1-alpha.15:CANARY_AI_API_KEY:GIT_SYNC_TOKEN",
      "bob:canary:core,site,publishing:0.1.1-alpha.15:CANARY_AI_API_KEY:GIT_SYNC_TOKEN",
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
      "cara:steady:core:0.1.1-alpha.14:CARA_AI_API_KEY:CARA_GIT_SYNC_TOKEN",
    ]);

    const snapshot = await readFile(
      join(root, "users/cara/brain.yaml"),
      "utf8",
    );
    expect(snapshot).toBe(
      "brain: brain\nbundles:\n  - core\ndomain: cara.rizom.ai\n",
    );
    expect(await readFile(join(root, "users/cara/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=rizom-ai/rover-cara-content\n",
    );
  });

  it("keeps hyphenated handles in generated content repo paths", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
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
