import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseArgs } from "../src/parse-args";

describe("parseArgs", () => {
  it("should parse 'init' command", () => {
    const result = parseArgs(["init"]);
    expect(result.command).toBe("init");
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

  it("should scaffold files when run with init command", async () => {
    const { runCommand } = await import("../src/run-command");
    const result = await runCommand(
      { command: "init", flags: { model: "rover" }, args: [] },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(testDir, "brain.yaml"))).toBe(true);
    expect(existsSync(join(testDir, "deploy.yml"))).toBe(true);
    expect(existsSync(join(testDir, ".env.example"))).toBe(true);
  });
});
