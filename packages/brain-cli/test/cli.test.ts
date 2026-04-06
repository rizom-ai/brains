import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseArgs } from "../src/parse-args";

describe("parseArgs", () => {
  it("should parse 'init' with directory as first arg", () => {
    const result = parseArgs(["init", "mybrain"]);
    expect(result.command).toBe("init");
    expect(result.args[0]).toBe("mybrain");
  });

  it("should parse 'init' with --model flag", () => {
    const result = parseArgs(["init", "--model", "rover"]);
    expect(result.command).toBe("init");
    expect(result.flags.model).toBe("rover");
  });

  it("should parse 'init' with --domain flag", () => {
    const result = parseArgs(["init", "--domain", "mybrain.rizom.ai"]);
    expect(result.command).toBe("init");
    expect(result.flags.domain).toBe("mybrain.rizom.ai");
  });

  it("should parse 'init' with --content-repo flag", () => {
    const result = parseArgs([
      "init",
      "--content-repo",
      "github:user/brain-data",
    ]);
    expect(result.command).toBe("init");
    expect(result.flags["content-repo"]).toBe("github:user/brain-data");
  });

  it("should parse --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("help");
  });

  it("should parse -h flag", () => {
    const result = parseArgs(["-h"]);
    expect(result.command).toBe("help");
  });

  it("should parse --version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBe("version");
  });

  it("should default to 'help' with no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });
});

describe("brain init (end-to-end)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cli-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should require directory argument", async () => {
    const { runCommand } = await import("../src/run-command");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover" },
        args: [],
      },
      testDir,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("directory");
  });

  it("should scaffold files in specified directory", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover" },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, "brain.yaml"))).toBe(true);
    expect(existsSync(join(outDir, ".env.example"))).toBe(true);
    expect(existsSync(join(outDir, "package.json"))).toBe(false);
  });

  it("should write .env when --ai-api-key is provided non-interactively", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const env = readFileSync(join(outDir, ".env"), "utf-8");
    expect(env).toContain("AI_API_KEY=sk-test-12345");
  });

  it("should not write .env when --ai-api-key is missing in non-interactive mode", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover", "no-interactive": true },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, ".env"))).toBe(false);
  });

  it("should activate git block when --content-repo is provided non-interactively", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          "content-repo": "user/brain-data",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const yaml = readFileSync(join(outDir, "brain.yaml"), "utf-8");
    expect(yaml).toMatch(/^\s*directory-sync:\s*$/m);
    expect(yaml).toContain("repo: user/brain-data");
    const env = readFileSync(join(outDir, ".env"), "utf-8");
    expect(env).toContain("GIT_SYNC_TOKEN=");
  });
});
