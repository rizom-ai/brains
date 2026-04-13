import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import packageJson from "../package.json";
import type { ResolvedUser } from "../src/load-registry";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";

async function createPilotRepo(files: Record<string, string>) {
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

  it("parses init command with repo path", () => {
    const result = parseArgs(["init", "/tmp/rover-pilot"]);
    expect(result.command).toBe("init");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
  });

  it("parses secrets:push with repo path, handle, and dry-run", () => {
    const result = parseArgs([
      "secrets:push",
      "/tmp/rover-pilot",
      "alice",
      "--dry-run",
    ]);
    expect(result.command).toBe("secrets:push");
    expect(result.args).toEqual(["/tmp/rover-pilot", "alice"]);
    expect(result.flags.dryRun).toBe(true);
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
    expect(result.flags.pushTo).toBe("gh");
  });

  it("parses cert:bootstrap with repo path and push target", () => {
    const result = parseArgs([
      "cert:bootstrap",
      "/tmp/rover-pilot",
      "--push-to",
      "gh",
    ]);
    expect(result.command).toBe("cert:bootstrap");
    expect(result.args).toEqual(["/tmp/rover-pilot"]);
    expect(result.flags.pushTo).toBe("gh");
  });

  it("defaults to help when no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });
});

describe("brains-ops runCommand", () => {
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
    expect(await readFile(join(repo, "pilot.yaml"), "utf8")).toContain(
      "schemaVersion: 1",
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
    expect(table).toContain("| alice | canary | rover | core |");
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

          if (url === "https://alice.rizom.ai/health") {
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
      "| alice | canary | rover | core | 0.1.1-alpha.14 | alice.rizom.ai | rover-alice-content | off | ready | ready | ready | ready |",
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
      "| alice | canary | rover | core | 0.1.1-alpha.14 | alice.rizom.ai | rover-alice-content | off | ready | ready | ready | failed |",
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

  it("returns usage error when secrets:push missing handle", async () => {
    const result = await runCommand({
      command: "secrets:push",
      args: ["/tmp/rover-pilot"],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      "Usage: brains-ops secrets:push <repo> <handle>",
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
      "brain: rover\ndomain: alice.rizom.ai\npreset: core\n\nanchors: []\n\nplugins:\n  directory-sync:\n    git:\n      repo: rizom-ai/rover-alice-content\n      authToken: ${GIT_SYNC_TOKEN}\n  mcp:\n    authToken: ${MCP_AUTH_TOKEN}\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nAI_API_KEY_SECRET=AI_API_KEY\nGIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_ALICE\nMCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_ALICE\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
    );
  });

  it("uses the default runner for onboard with a discord anchor user", async () => {
    const root = await createPilotRepo({
      ...baseFiles,
      "users/bob.yaml": `handle: bob
discord:
  enabled: true
  anchorUserId: "123456789"
`,
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

    const runner = async (user: ResolvedUser) => {
      calls.push(`${user.handle}:${user.cohort}:${user.preset}`);
      return {
        brainYaml: `brain: ${user.model}\npreset: ${user.preset}\ndomain: ${user.domain}\n`,
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
      "brain: rover\npreset: core\ndomain: alice.rizom.ai\n",
    );
    expect(await readFile(join(root, "users/alice/.env"), "utf8")).toBe(
      "BRAIN_VERSION=0.1.1-alpha.14\nAI_API_KEY_SECRET=AI_API_KEY\nGIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_ALICE\nMCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_ALICE\nCONTENT_REPO=rizom-ai/rover-alice-content\n",
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
      "MCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_ALICE",
    );
    expect(await readFile(join(root, "users/bob/.env"), "utf8")).toContain(
      "DISCORD_BOT_TOKEN_SECRET=DISCORD_BOT_TOKEN_BOB",
    );
  });

  it("uses injected operator runner for reconcile-all", async () => {
    const root = await createPilotRepo(baseFiles);
    const calls: string[] = [];

    const runner = async (user: ResolvedUser) => {
      calls.push(`${user.handle}:${user.cohort}:${user.preset}`);
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
      "DISCORD_BOT_TOKEN_SECRET=DISCORD_BOT_TOKEN_BOB",
    );
  });

  it("shows help with init included", async () => {
    const result = await runCommand({ command: "help", args: [], flags: {} });

    expect(result.success).toBe(true);
    expect(result.message).toContain("brains-ops — operator CLI");
    expect(result.message).toContain("init <repo>");
    expect(result.message).toContain("render <repo>");
    expect(result.message).toContain("ssh-key:bootstrap <repo>");
    expect(result.message).toContain("cert:bootstrap <repo>");
    expect(result.message).toContain("secrets:push <repo> <handle>");
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
