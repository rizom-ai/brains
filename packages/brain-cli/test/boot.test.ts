import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseBrainYaml } from "../src/lib/brain-yaml";
import { resolveModelName, isBuiltinModel } from "../src/lib/model-registry";

describe("parseBrainYaml", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-boot-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should parse brain.yaml with bare model name", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\npreset: default\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("rover");
    expect(config.preset).toBe("default");
  });

  it("should parse brain.yaml with @brains/ prefix (backward compat)", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      'brain: "@brains/rover"\npreset: pro\n',
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("rover");
    expect(config.preset).toBe("pro");
  });

  it("should throw when brain.yaml is missing", () => {
    expect(() => parseBrainYaml(testDir)).toThrow("brain.yaml");
  });

  it("should throw when brain field is missing", () => {
    writeFileSync(join(testDir, "brain.yaml"), "preset: default\n");
    expect(() => parseBrainYaml(testDir)).toThrow("brain");
  });
});

describe("model resolution for boot", () => {
  it("should resolve rover as built-in", () => {
    const name = resolveModelName("rover");
    expect(isBuiltinModel(name)).toBe(true);
  });

  it("should resolve @brains/rover as built-in", () => {
    const name = resolveModelName("@brains/rover");
    expect(isBuiltinModel(name)).toBe(true);
  });

  it("should not resolve unknown model as built-in", () => {
    expect(isBuiltinModel("custom")).toBe(false);
  });
});
