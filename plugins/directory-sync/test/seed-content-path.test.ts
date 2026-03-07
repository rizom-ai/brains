import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { copySeedContentIfNeeded } from "../src/lib/seed-content";
import { createSilentLogger } from "@brains/test-utils";

/**
 * Regression test: seed content should be copyable from a custom path,
 * not just from `${CWD}/seed-content`.
 *
 * When brain models live in a separate package (e.g. brains/team/),
 * their seed-content directory is not in the app's CWD.
 */
describe("copySeedContentIfNeeded with custom path", () => {
  const testDir = "/tmp/test-seed-content-path";
  const brainDataDir = join(testDir, "brain-data");
  const seedDir = join(testDir, "custom-seed");
  const logger = createSilentLogger("test");

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(brainDataDir, { recursive: true });
    mkdirSync(join(seedDir, "brain-character"), { recursive: true });
    writeFileSync(
      join(seedDir, "brain-character", "brain-character.md"),
      "---\nname: Test Brain\nrole: Test role\n---\n",
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should copy seed content from a custom seedContentPath", async () => {
    await copySeedContentIfNeeded(brainDataDir, logger, seedDir);

    const copied = join(brainDataDir, "brain-character", "brain-character.md");
    expect(existsSync(copied)).toBe(true);
    expect(readFileSync(copied, "utf-8")).toContain("name: Test Brain");
  });

  it("should skip if brain-data is not empty", async () => {
    // Put something in brain-data first
    writeFileSync(join(brainDataDir, "existing.md"), "existing");

    await copySeedContentIfNeeded(brainDataDir, logger, seedDir);

    // Should NOT have copied seed content
    const copied = join(brainDataDir, "brain-character");
    expect(existsSync(copied)).toBe(false);
  });

  it("should handle missing seedContentPath gracefully", async () => {
    await copySeedContentIfNeeded(brainDataDir, logger, "/nonexistent/path");

    // brain-data should still be empty (no crash)
    expect(existsSync(brainDataDir)).toBe(true);
  });
});
