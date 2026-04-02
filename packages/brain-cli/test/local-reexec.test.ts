import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { findLocalBrain } from "../src/lib/local-reexec";

describe("findLocalBrain", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-reexec-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return path when local brain exists", () => {
    const brainPath = join(testDir, "node_modules", "@rizom", "brain", "dist");
    mkdirSync(brainPath, { recursive: true });
    writeFileSync(join(brainPath, "brain.js"), "// stub");

    const result = findLocalBrain(testDir);
    expect(result).toBe(join(brainPath, "brain.js"));
  });

  it("should return undefined when no local brain", () => {
    const result = findLocalBrain(testDir);
    expect(result).toBeUndefined();
  });

  it("should return undefined when node_modules exists but no brain", () => {
    mkdirSync(join(testDir, "node_modules"), { recursive: true });
    const result = findLocalBrain(testDir);
    expect(result).toBeUndefined();
  });
});
