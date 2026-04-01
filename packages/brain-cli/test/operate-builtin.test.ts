import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registerModel, resetModels } from "../src/lib/model-registry";
import { resolveRunnerType } from "../src/commands/start";
import { operate } from "../src/commands/operate";

describe("operate with builtin models", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-operate-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "brain.yaml"), "brain: rover\n");
    resetModels();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetModels();
  });

  it("should detect builtin runner type when models are registered", () => {
    registerModel("rover", { name: "rover" });
    expect(resolveRunnerType(testDir)).toBe("builtin");
  });

  it("should fall back to undefined when no models and no runner", () => {
    expect(resolveRunnerType(testDir)).toBeUndefined();
  });

  it("should fail with unknown model when model not registered", async () => {
    registerModel("ranger", { name: "ranger" });
    const result = await operate(testDir, "status", [], {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown model");
    expect(result.message).toContain("rover");
  });

  it("should fail gracefully when no runner and no models", async () => {
    const result = await operate(testDir, "status", [], {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Could not find brain runner");
  });
});
