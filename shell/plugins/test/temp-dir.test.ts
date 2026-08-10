import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createTempDataDir,
  createTempDataDirSync,
  removeTrackedTempDataDirs,
} from "../src/test/temp-dir";

describe("createTempDataDir", () => {
  test("creates a directory under the system temp dir with the given prefix", async () => {
    const dir = await createTempDataDir("brains-temp-dir-test-");

    expect(existsSync(dir)).toBe(true);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir).toContain("brains-temp-dir-test-");

    removeTrackedTempDataDirs();
  });

  test("removes every directory it handed out", async () => {
    const first = await createTempDataDir("brains-temp-dir-test-");
    const second = createTempDataDirSync("brains-temp-dir-test-");

    removeTrackedTempDataDirs();

    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
  });

  test("is idempotent and does not fail on an already-removed directory", async () => {
    const dir = await createTempDataDir("brains-temp-dir-test-");

    removeTrackedTempDataDirs();
    removeTrackedTempDataDirs();

    expect(existsSync(dir)).toBe(false);
  });

  test("does not remove directories handed out after the last cleanup", async () => {
    const before = await createTempDataDir("brains-temp-dir-test-");
    removeTrackedTempDataDirs();

    const after = await createTempDataDir("brains-temp-dir-test-");

    expect(existsSync(before)).toBe(false);
    expect(existsSync(after)).toBe(true);

    removeTrackedTempDataDirs();
  });
});
