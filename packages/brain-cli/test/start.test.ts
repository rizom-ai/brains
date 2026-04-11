import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveRunnerType } from "../src/commands/start";
import { registerModel, resetModels } from "../src/lib/model-registry";

describe("brain start", () => {
  it("should detect brain.yaml in target directory", () => {
    const appDir = join(import.meta.dir, "..", "..", "..", "apps", "rizom-ai");
    expect(existsSync(join(appDir, "brain.yaml"))).toBe(true);
  });

  it("should detect monorepo context by checking for bun.lock", () => {
    const monorepoRoot = join(import.meta.dir, "..", "..", "..");
    expect(existsSync(join(monorepoRoot, "bun.lock"))).toBe(true);
  });

  it("should detect standalone context by absence of bun.lock", () => {
    expect(existsSync("/tmp/bun.lock")).toBe(false);
  });
});

describe("resolveRunnerType", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-start-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    resetModels();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetModels();
  });

  it("should return 'builtin' when models are registered", () => {
    registerModel("rover", { name: "rover" });
    expect(resolveRunnerType(testDir)).toBe("builtin");
  });

  it("should return 'docker' when dist/.model-entrypoint.js exists", () => {
    mkdirSync(join(testDir, "dist"), { recursive: true });
    writeFileSync(join(testDir, "dist", ".model-entrypoint.js"), "");
    expect(resolveRunnerType(testDir)).toBe("docker");
  });

  it("should prefer docker over builtin when both exist", () => {
    registerModel("rover", { name: "rover" });
    mkdirSync(join(testDir, "dist"), { recursive: true });
    writeFileSync(join(testDir, "dist", ".model-entrypoint.js"), "");
    expect(resolveRunnerType(testDir)).toBe("docker");
  });

  it("should return undefined when nothing matches", () => {
    expect(resolveRunnerType(testDir)).toBeUndefined();
  });

  it("should return 'monorepo' for a directory inside the current repo", () => {
    expect(resolveRunnerType(import.meta.dir)).toBe("monorepo");
  });
});
