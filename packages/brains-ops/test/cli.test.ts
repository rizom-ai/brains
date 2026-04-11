import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

  it("defaults to help when no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });
});

describe("brains-ops runCommand", () => {
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
    "cohorts/canary.yaml": `members:
  - alice
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

    const result = await runCommand({
      command: "render",
      args: [root],
      flags: {},
    });

    expect(result.success).toBe(true);
    const table = await readFile(join(root, "views/users.md"), "utf8");
    expect(table).toContain("| alice | canary | rover | core |");
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
});
