import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";
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

  it("should parse 'init' with --backend flag", () => {
    const result = parseArgs(["init", "--backend", "env"]);
    expect(result.command).toBe("init");
    expect(result.flags.backend).toBe("env");
  });

  it("should parse 'init' with --regen flag", () => {
    const result = parseArgs(["init", "mybrain", "--deploy", "--regen"]);
    expect(result.command).toBe("init");
    expect(result.flags.deploy).toBe(true);
    expect(result.flags.regen).toBe(true);
  });

  it("should parse 'cert:bootstrap' with --push-to flag", () => {
    const result = parseArgs(["cert:bootstrap", "--push-to", "gh"]);
    expect(result.command).toBe("cert:bootstrap");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("should parse 'secrets:push' with --push-to flag", () => {
    const result = parseArgs(["secrets:push", "--push-to", "gh"]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("should parse 'secrets:push' with --all and --only flags", () => {
    const result = parseArgs([
      "secrets:push",
      "--all",
      "--only",
      "AI_API_KEY,HCLOUD_TOKEN",
    ]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags.all).toBe(true);
    expect(result.flags.only).toBe("AI_API_KEY,HCLOUD_TOKEN");
  });

  it("should parse 'secrets:push' with --dry-run flag", () => {
    const result = parseArgs(["secrets:push", "--dry-run"]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("should parse 'start' with --startup-check flag", () => {
    const result = parseArgs(["start", "--startup-check"]);
    expect(result.command).toBe("start");
    expect(result.flags["startup-check"]).toBe(true);
  });

  it("should parse 'ssh-key:bootstrap' with --push-to flag", () => {
    const result = parseArgs(["ssh-key:bootstrap", "--push-to", "gh"]);
    expect(result.command).toBe("ssh-key:bootstrap");
    expect(result.flags["push-to"]).toBe("gh");
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
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
    expect(existsSync(join(outDir, "README.md"))).toBe(true);
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

  it("should pass the selected backend through to .env.schema", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          backend: "env",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const envSchema = readFileSync(join(outDir, ".env.schema"), "utf-8");
    expect(envSchema).toContain("@plugin(@varlock/env-plugin)");
    expect(envSchema).not.toContain("OP_TOKEN=");
  });
});

describe("secrets push (end-to-end)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cli-secrets-push-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should dry-run secrets push without contacting a backend", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "AI_API_KEY=",
        "",
        "# ---- secret backend bootstrap ----",
        "OP_TOKEN=",
        "",
      ].join("\n"),
    );
    writeFileSync(join(testDir, ".env"), "AI_API_KEY=sk-test-12345\n");

    const { runCommand } = await import("../src/run-command");
    const result = await runCommand(
      {
        command: "secrets:push",
        flags: { "push-to": "gh", "dry-run": true },
        args: [],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Dry run");
  });
});
