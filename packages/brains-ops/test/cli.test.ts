import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import packageJson from "../package.json";
import type { ResolvedUser } from "../src/load-registry";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-cli-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("brains-ops parseArgs", () => {
  it("parses render command with repo path", () => {
    const result = parseArgs(["render", "/tmp/rover-pilot"]);
    expect(result.command).toBe("render");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
  });

  it("parses onboard with repo path and handle", () => {
    const result = parseArgs(["onboard", "/tmp/rover-pilot", "alice"]);
    expect(result.command).toBe("onboard");
    expect(result.args).toEqual(["/tmp/rover-pilot", "alice"]);
  });

  it("parses user:add with cohort and anchor id flags", () => {
    const result = parseArgs([
      "user:add",
      "/tmp/rover-pilot",
      "alice",
      "--cohort",
      "cohort-1",
      "--anchor-id",
      "1234567890",
    ]);
    expect(result.command).toBe("user:add");
    expect(result.args).toEqual(["/tmp/rover-pilot", "alice"]);
    expect(result.flags["cohort"]).toBe("cohort-1");
    expect(result.flags["anchor-id"]).toBe("1234567890");
  });

  it("parses init command with repo path", () => {
    const result = parseArgs(["init", "/tmp/rover-pilot"]);
    expect(result.command).toBe("init");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
  });

  it("parses crossover staging with reviewed site pins", () => {
    const result = parseArgs([
      "crossover:stage",
      "/tmp/rover-pilot",
      "/tmp/review",
      "/tmp/site-pins.yaml",
    ]);
    expect(result.command).toBe("crossover:stage");
    expect(result.args).toEqual([
      "/tmp/rover-pilot",
      "/tmp/review",
      "/tmp/site-pins.yaml",
    ]);
  });

  it("parses secrets:push with repo path and dry-run", () => {
    const result = parseArgs(["secrets:push", "/tmp/rover-pilot", "--dry-run"]);
    expect(result.command).toBe("secrets:push");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("parses secrets:encrypt with repo path, handle, and dry-run", () => {
    const result = parseArgs([
      "secrets:encrypt",
      "/tmp/rover-pilot",
      "alice",
      "--dry-run",
    ]);
    expect(result.command).toBe("secrets:encrypt");
    expect(result.args).toEqual(["/tmp/rover-pilot", "alice"]);
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("parses age-key:bootstrap with repo path and push target", () => {
    const result = parseArgs([
      "age-key:bootstrap",
      "/tmp/rover-pilot",
      "--push-to",
      "gh",
    ]);
    expect(result.command).toBe("age-key:bootstrap");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("parses ssh-key:bootstrap with repo path and push target", () => {
    const result = parseArgs([
      "ssh-key:bootstrap",
      "/tmp/rover-pilot",
      "--push-to",
      "gh",
    ]);
    expect(result.command).toBe("ssh-key:bootstrap");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("parses cert:bootstrap with repo path, handle, and push target", () => {
    const result = parseArgs([
      "cert:bootstrap",
      "/tmp/rover-pilot",
      "--handle",
      "rizom-ai",
      "--push-to",
      "gh",
    ]);
    expect(result.command).toBe("cert:bootstrap");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
    expect(result.flags["handle"]).toBe("rizom-ai");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("parses verify-user with repo path and handle", () => {
    const result = parseArgs(["verify-user", "/tmp/rover-pilot", "alice"]);
    expect(result.command).toBe("verify-user");
    expect(result.args).toEqual(["/tmp/rover-pilot", "alice"]);
  });

  it("parses smoke-only directory-sync stress options", () => {
    const result = parseArgs([
      "stress:directory-sync",
      "/tmp/rover-pilot",
      "smoke",
      "--profile",
      "load",
      "--confirm",
      "stress:smoke",
      "--artifacts-dir",
      "/tmp/artifacts",
    ]);
    expect(result.command).toBe("stress:directory-sync");
    expect(result.args).toEqual(["/tmp/rover-pilot", "smoke"]);
    expect(result.flags).toMatchObject({
      profile: "load",
      confirm: "stress:smoke",
      "artifacts-dir": "/tmp/artifacts",
    });
  });

  it("parses the write-free directory-sync credential check", () => {
    const result = parseArgs([
      "stress:directory-sync:verify-access",
      "/tmp/rover-pilot",
      "smoke",
      "--confirm",
      "stress:smoke",
      "--artifacts-dir",
      "/tmp/artifacts",
    ]);
    expect(result.command).toBe("stress:directory-sync:verify-access");
    expect(result.args).toEqual(["/tmp/rover-pilot", "smoke"]);
    expect(result.flags).toMatchObject({
      confirm: "stress:smoke",
      "artifacts-dir": "/tmp/artifacts",
    });
  });

  it("defaults to help when no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });
});

describe("brains-ops runCommand", () => {
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
discord:
  enabled: false
`,
    "users/bob.yaml": `handle: bob
discord:
  enabled: true
`,
    "cohorts/canary.yaml": `members:
  - alice
  - bob
`,
  } satisfies Record<string, string>;

  it("creates repo skeleton for init command", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-run-"));
    const repo = join(root, "rover-pilot");

    const result = await runCommand({
      command: "init",
      args: [repo],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(await readFile(join(repo, "pilot.yaml"), "utf8")).not.toContain(
      "schemaVersion:",
    );
  });

  it("renders table for render command", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "render",
        args: [root],
        flags: {},
      },
      {
        resolveStatus() {
          return Promise.resolve(undefined);
        },
      },
    );

    expect(result.success).toBe(true);
    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain("| alice | canary | core |  |  |");
    expect(table).toContain("| alice.rizom.ai | rover-alice-content |");
  });

  it("uses built-in live probes for render when no custom resolver is provided", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "render",
        args: [root],
        flags: {},
      },
      {
        lookupHost(hostname) {
          expect(hostname).toBe("alice.rizom.ai");
          return Promise.resolve({ address: "203.0.113.10", family: 4 });
        },
        fetchImpl(input, init) {
          const url = typeof input === "string" ? input : input.toString();

          if (
            url === "https://alice.rizom.ai/health/ready" ||
            url === "https://alice.rizom.ai/health/operate"
          ) {
            expect(init?.method).toBe("GET");
            return Promise.resolve(new Response("ok", { status: 200 }));
          }

          if (url === "https://alice.rizom.ai/mcp") {
            expect(init?.method).toBe("POST");
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: {
                    code: -32001,
                    message: "Unauthorized: Bearer token required",
                  },
                  id: null,
                }),
                {
                  status: 401,
                  headers: { "content-type": "application/json" },
                },
              ),
            );
          }

          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(true);
    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| alice | canary | core |  |  | 0.1.1-alpha.14 | alice.rizom.ai | rover-alice-content | off | ready | ready | ready | ready |",
    );
  });

  it("does not report a deployment ready when operational health is degraded", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "render",
        args: [root],
        flags: {},
      },
      {
        lookupHost: async () => ({ address: "203.0.113.10", family: 4 }),
        fetchImpl(input) {
          const url = typeof input === "string" ? input : input.toString();
          if (url.endsWith("/health/ready")) {
            return Promise.resolve(new Response("ok", { status: 200 }));
          }
          if (url.endsWith("/health/operate")) {
            return Promise.resolve(new Response("degraded", { status: 503 }));
          }
          if (url.endsWith("/mcp")) {
            return Promise.resolve(
              new Response("Unauthorized", { status: 401 }),
            );
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(true);
    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| alice | canary | core |  |  | 0.1.1-alpha.14 | alice.rizom.ai | rover-alice-content | off | ready | failed | ready | ready |",
    );
  });

  it("renders table with injected observed status", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "render",
        args: [root],
        flags: {},
      },
      {
        resolveStatus(user) {
          return Promise.resolve(
            user.handle === "alice"
              ? {
                  serverStatus: "ready",
                  deployStatus: "ready",
                  dnsStatus: "ready",
                  mcpStatus: "failed",
                }
              : undefined,
          );
        },
      },
    );

    expect(result.success).toBe(true);
    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain(
      "| alice | canary | core |  |  | 0.1.1-alpha.14 | alice.rizom.ai | rover-alice-content | off | ready | ready | ready | failed |",
    );
  });

  it("adds a pilot user from the CLI", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": baseFiles["pilot.yaml"],
      "cohorts/cohort-1.yaml": `members:\n  - alice\n`,
    });

    const result = await runCommand({
      command: "user:add",
      args: [root, "bob"],
      flags: { cohort: "cohort-1", "anchor-id": "1234567890" },
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Added bob to cohort-1");
    expect(await readFile(join(root, "users/bob.yaml"), "utf8")).toContain(
      'anchorUserId: "1234567890"',
    );
    expect(await readFile(join(root, "cohorts/cohort-1.yaml"), "utf8")).toBe(
      `members:\n  - alice\n  - bob\n`,
    );
  });

  it("returns usage error when user:add is missing cohort", async () => {
    const result = await runCommand({
      command: "user:add",
      args: ["/tmp/rover-pilot", "alice"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops user:add <repo> <handle> --cohort <cohort>",
    );
  });

  it("returns usage error when onboard missing handle", async () => {
    const result = await runCommand({
      command: "onboard",
      args: ["/tmp/rover-pilot"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops onboard <repo> <handle>",
    );
  });

  it("runs an injected directory-sync stress driver", async () => {
    const result = await runCommand(
      {
        command: "stress:directory-sync",
        args: ["/tmp/rover-pilot", "smoke"],
        flags: {
          profile: "regression",
          confirm: "stress:smoke",
          "artifacts-dir": "/tmp/artifacts",
        },
      },
      {
        async directorySyncStressRunner(options) {
          expect(options).toMatchObject({
            rootDir: "/tmp/rover-pilot",
            handle: "smoke",
            profile: "regression",
            confirmation: "stress:smoke",
            artifactsDir: "/tmp/artifacts",
          });
          return {
            runId: "20260805170000",
            artifactsDir: "/tmp/artifacts",
            target: {
              handle: "smoke",
              domain: "smoke.rizom.ai",
              contentRepo: "rizom-ai/rover-smoke-content",
            },
            startedAt: "2026-08-05T17:00:00.000Z",
            completedAt: "2026-08-05T17:05:00.000Z",
            report: {
              profile: "regression",
              success: true,
              baseline: {
                entities: 41,
                notes: 7,
                version: "0.2.0-alpha.253",
              },
              phases: [],
              cleanup: {
                success: true,
                probesRemaining: 0,
                finalEntities: 41,
                finalNotes: 7,
              },
              metrics: { health: [], runtime: [] },
            },
          };
        },
      },
    );

    expect(result).toEqual({
      success: true,
      message:
        "Passed regression directory-sync stress for smoke; artifacts: /tmp/artifacts",
    });
  });

  it("runs an injected directory-sync credential check", async () => {
    const result = await runCommand(
      {
        command: "stress:directory-sync:verify-access",
        args: ["/tmp/rover-pilot", "smoke"],
        flags: {
          confirm: "stress:smoke",
          "artifacts-dir": "/tmp/artifacts",
        },
      },
      {
        async directorySyncStressAccessRunner(options) {
          expect(options).toMatchObject({
            rootDir: "/tmp/rover-pilot",
            handle: "smoke",
            confirmation: "stress:smoke",
            artifactsDir: "/tmp/artifacts",
          });
          return {
            success: true,
            artifactsDir: "/tmp/artifacts",
            checkedAt: "2026-08-10T14:00:00.000Z",
            remoteHead: "abc123",
            target: {
              handle: "smoke",
              domain: "smoke.rizom.ai",
              contentRepo: "rizom-ai/rover-smoke-content",
            },
          };
        },
      },
    );

    expect(result).toEqual({
      success: true,
      message:
        "Verified directory-sync stress access for smoke at abc123; artifacts: /tmp/artifacts",
    });
  });

  it("verifies a site-enabled user from the CLI", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "cohorts/canary.yaml": `bundlesOverride:
  - core
  - site
  - publishing
members:
  - alice
  - bob
`,
    });
    const requestedUrls: string[] = [];
    const warnings: string[] = [];

    const result = await runCommand(
      {
        command: "verify-user",
        args: [root, "alice"],
        flags: {},
      },
      {
        logger(message) {
          warnings.push(message);
        },
        fetchImpl(input, init) {
          const url = typeof input === "string" ? input : input.toString();
          requestedUrls.push(`${init?.method ?? "GET"} ${url}`);

          if (url === "https://alice.rizom.ai/health/operate") {
            return Promise.resolve(
              Response.json({
                status: "ready",
                operationalStatus: "operational",
                app: {
                  daemons: [{ name: "webserver", status: "running" }],
                },
              }),
            );
          }

          if (url === "https://alice.rizom.ai/mcp") {
            return Promise.resolve(
              new Response("Unauthorized", { status: 401 }),
            );
          }

          if (
            url === "https://alice.rizom.ai/" ||
            url === "https://alice.rizom.ai/cms"
          ) {
            return Promise.resolve(new Response("ok", { status: 200 }));
          }

          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe(
      "Verified alice (core,site,publishing) at https://alice.rizom.ai: health, mcp-auth-gate, site, cms",
    );
    expect(requestedUrls).toEqual([
      "GET https://alice.rizom.ai/health/operate",
      "POST https://alice.rizom.ai/mcp",
      "GET https://alice.rizom.ai/",
      "GET https://alice.rizom.ai/cms",
    ]);
    expect(warnings).toEqual([
      "WARN Manual check still required: passkey setup/handoff completed from the setup email.",
    ]);
  });

  it("returns usage error when verify-user is missing a handle", async () => {
    const result = await runCommand({
      command: "verify-user",
      args: ["/tmp/rover-pilot"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops verify-user <repo> <handle>",
    );
  });

  it("retries transient operational degradation before passing", async () => {
    const root = await createPilotRepo(baseFiles);
    let healthAttempts = 0;
    const sleeps: number[] = [];

    const result = await runCommand(
      {
        command: "verify-user",
        args: [root, "alice"],
        flags: {},
      },
      {
        verificationRetryAttempts: 3,
        verificationRetryDelayMs: 25,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
        },
        fetchImpl(input) {
          const url = typeof input === "string" ? input : input.toString();
          if (url === "https://alice.rizom.ai/health/operate") {
            healthAttempts++;
            return Promise.resolve(
              healthAttempts === 1
                ? new Response("degraded", { status: 503 })
                : Response.json({
                    status: "ready",
                    operationalStatus: "operational",
                    app: { daemons: [] },
                  }),
            );
          }
          if (url === "https://alice.rizom.ai/mcp") {
            return Promise.resolve(
              new Response("Unauthorized", { status: 401 }),
            );
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(true);
    expect(healthAttempts).toBe(2);
    expect(sleeps).toEqual([25]);
  });

  it("includes degraded operational check details in a failed health check", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "verify-user",
        args: [root, "alice"],
        flags: {},
      },
      {
        verificationRetryAttempts: 1,
        fetchImpl(input) {
          const url = typeof input === "string" ? input : input.toString();
          if (url === "https://alice.rizom.ai/health/operate") {
            return Promise.resolve(
              Response.json(
                {
                  status: "ready",
                  operationalStatus: "degraded",
                  checks: [
                    {
                      name: "job-worker",
                      status: "degraded",
                      message: "No live worker session",
                    },
                  ],
                  app: { daemons: [] },
                },
                { status: 503 },
              ),
            );
          }
          if (url === "https://alice.rizom.ai/mcp") {
            return Promise.resolve(
              new Response("Unauthorized", { status: 401 }),
            );
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "health: /health/operate returned 503, expected 200 (job-worker: No live worker session)",
    );
  });

  it("reports an unhealthy daemon as a failed health check", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "verify-user",
        args: [root, "alice"],
        flags: {},
      },
      {
        verificationRetryAttempts: 1,
        fetchImpl(input) {
          const url = typeof input === "string" ? input : input.toString();
          if (url === "https://alice.rizom.ai/health/operate") {
            return Promise.resolve(
              Response.json({
                status: "ready",
                operationalStatus: "operational",
                app: {
                  daemons: [
                    {
                      name: "site-builder",
                      status: "error",
                      health: {
                        status: "unhealthy",
                        message: "build failed",
                      },
                    },
                  ],
                },
              }),
            );
          }
          if (url === "https://alice.rizom.ai/mcp") {
            return Promise.resolve(
              new Response("Unauthorized", { status: 401 }),
            );
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("passed mcp-auth-gate");
    expect(result.message).toContain("failed:");
    expect(result.message).toContain(
      "health: daemon site-builder is unhealthy",
    );
  });

  it("reports a non-gating /mcp response as a failed mcp-auth-gate check", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand(
      {
        command: "verify-user",
        args: [root, "alice"],
        flags: {},
      },
      {
        fetchImpl(input) {
          const url = typeof input === "string" ? input : input.toString();
          if (url === "https://alice.rizom.ai/health/operate") {
            return Promise.resolve(
              Response.json({
                status: "ready",
                operationalStatus: "operational",
                app: { daemons: [] },
              }),
            );
          }
          if (url === "https://alice.rizom.ai/mcp") {
            return Promise.resolve(new Response("ok", { status: 200 }));
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("passed health");
    expect(result.message).toContain(
      "mcp-auth-gate: unauthenticated POST /mcp returned 200",
    );
  });

  it("throws when verify-user is given an unknown handle", async () => {
    const root = await createPilotRepo(baseFiles);

    let caught: Error | undefined;
    try {
      await runCommand(
        {
          command: "verify-user",
          args: [root, "carol"],
          flags: {},
        },
        {
          fetchImpl() {
            throw new Error("fetch should not run for unknown handle");
          },
        },
      );
    } catch (err) {
      if (err instanceof Error) {
        caught = err;
      }
    }

    expect(caught?.message).toContain("Unknown pilot user: carol");
  });

  it("returns usage error when reconcile-cohort missing cohort", async () => {
    const result = await runCommand({
      command: "reconcile-cohort",
      args: ["/tmp/rover-pilot"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops reconcile-cohort <repo> <cohort>",
    );
  });

  it("returns usage error when secrets:push missing repo", async () => {
    const result = await runCommand({
      command: "secrets:push",
      args: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Usage: brains-ops secrets:push <repo>");
  });

  it("returns usage error when secrets:encrypt missing handle", async () => {
    const result = await runCommand({
      command: "secrets:encrypt",
      args: ["/tmp/rover-pilot"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops secrets:encrypt <repo> <handle>",
    );
  });

  it("returns usage error when age-key:bootstrap missing repo", async () => {
    const result = await runCommand({
      command: "age-key:bootstrap",
      args: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops age-key:bootstrap <repo>",
    );
  });

  it("returns usage error when ssh-key:bootstrap missing repo", async () => {
    const result = await runCommand({
      command: "ssh-key:bootstrap",
      args: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops ssh-key:bootstrap <repo>",
    );
  });

  it("returns usage error when cert:bootstrap missing repo", async () => {
    const result = await runCommand({
      command: "cert:bootstrap",
      args: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Usage: brains-ops cert:bootstrap <repo>");
  });

  it("uses the default runner for onboard", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand({
      command: "onboard",
      args: [root, "alice"],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nkind: professional\ndomain: alice.rizom.ai\nbundles:\n  - core\n\nanchors: []\n\nplugins:\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
    );
  });

  it("uses the default runner for onboard with a discord anchor user", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/bob.yaml": `handle: bob\ndiscord:\n  enabled: true\n  anchorUserId: "123456789"\n`,
    });

    const result = await runCommand({
      command: "onboard",
      args: [root, "bob"],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(
      await readFile(join(root, "users/bob/brain.yaml"), "utf8"),
    ).toContain('anchors: ["discord:123456789"]');
  });

  it("uses injected operator runner for onboard", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    const runner = async (
      user: ResolvedUser,
    ): Promise<{ brainYaml: string }> => {
      calls.push(`${user.handle}:${user.cohort}:${user.bundles.join(",")}`);
      return {
        brainYaml: `brain: brain\nbundles:\n  - core\ndomain: ${user.domain}\n`,
      };
    };

    const result = await runCommand(
      {
        command: "onboard",
        args: [root, "alice"],
        flags: {},
      },
      { runner },
    );

    expect(result.success).toBe(true);
    expect(calls).toEqual(["alice:canary:core"]);
    expect(await readFile(join(root, "users/alice/brain.yaml"), "utf8")).toBe(
      "brain: brain\nbundles:\n  - core\ndomain: alice.rizom.ai\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
    );
  });

  it("uses the default runner for reconcile-all", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand({
      command: "reconcile-all",
      args: [root],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-alice-content",
    );
    expect(await readFile(join(root, "users/bob/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-bob-content",
    );
  });

  it("dry-runs reconcile-all without writing the source repo", async () => {
    const root = await createPilotRepo(baseFiles);

    const result = await runCommand({
      command: "reconcile-all",
      args: [root],
      flags: { "dry-run": true },
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe(
      [
        "Dry-run reconcile found 6 first-pass changed file(s); second pass converged with zero drift",
        "First-pass changed files:",
        "- users/alice/.env",
        "- users/alice/brain.yaml",
        "- users/alice/content/anchor-profile/anchor-profile.md",
        "- users/bob/.env",
        "- users/bob/brain.yaml",
        "- users/bob/content/anchor-profile/anchor-profile.md",
        "Second-pass changed files:",
        "- (none)",
      ].join("\n"),
    );
    expect(await Bun.file(join(root, "users/alice/brain.yaml")).exists()).toBe(
      false,
    );
  });

  it("uses injected operator runner for reconcile-all", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    const runner = async (user: ResolvedUser): Promise<void> => {
      calls.push(`${user.handle}:${user.cohort}:${user.bundles.join(",")}`);
    };

    const result = await runCommand(
      {
        command: "reconcile-all",
        args: [root],
        flags: {},
      },
      { runner },
    );

    expect(result.success).toBe(true);
    expect(calls).toEqual(["alice:canary:core", "bob:canary:core"]);
    expect(await readFile(join(root, "users/bob/.env"), "utf8")).toContain(
      "CONTENT_REPO=rizom-ai/rover-bob-content",
    );
  });

  it("shows help with init included", async () => {
    const result = await runCommand({ command: "help", args: [], flags: {} });

    expect(result.success).toBe(true);
    expect(result.message).toContain("brains-ops — operator CLI");
    expect(result.message).toContain("init <repo>");
    expect(result.message).toContain("render <repo>");
    expect(result.message).toContain(
      "user:add <repo> <handle> --cohort <cohort>",
    );
    expect(result.message).toContain("age-key:bootstrap <repo>");
    expect(result.message).toContain("ssh-key:bootstrap <repo>");
    expect(result.message).toContain("cert:bootstrap <repo>");
    expect(result.message).toContain("secrets:push <repo>");
    expect(result.message).toContain("secrets:encrypt <repo> <handle>");
    expect(result.message).toContain("verify-user <repo> <handle>");
    expect(result.message).toContain(
      "stress:directory-sync:verify-access <repo> <handle>",
    );
    expect(result.message).not.toContain("requires operator runner");
  });

  it("shows package version", async () => {
    const result = await runCommand({
      command: "version",
      args: [],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe(`brains-ops ${packageJson.version}`);
  });
});
