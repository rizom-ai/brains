import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generatePinPackageJson } from "../src/commands/pin";

describe("brain pin", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-pin-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("generatePinPackageJson", () => {
    it("should generate package.json with pinned version", () => {
      const pkg = generatePinPackageJson("0.1.0");
      expect(pkg.dependencies["@rizom/brain"]).toBe("0.1.0");
    });

    it("should set private: true", () => {
      const pkg = generatePinPackageJson("0.1.0");
      expect(pkg.private).toBe(true);
    });

    it("should have a name field", () => {
      const pkg = generatePinPackageJson("0.1.0");
      expect(pkg.name).toBe("brain-instance");
    });
  });
});
