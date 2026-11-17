import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileExists, normalizePath } from "../src/fs-paths";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});

describe("fileExists", () => {
  it("is true for a file that is there and false for one that is not", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ops-fs-paths-"));
    dirs.push(dir);
    await writeFile(join(dir, "pilot.yaml"), "");
    expect(await fileExists(join(dir, "pilot.yaml"))).toBe(true);
    expect(await fileExists(join(dir, "missing.yaml"))).toBe(false);
  });
});

describe("normalizePath", () => {
  it("writes a path with forward slashes on every platform", () => {
    expect(normalizePath("users\\ada\\brain.yaml")).toBe(
      "users/ada/brain.yaml",
    );
    expect(normalizePath("users/ada/brain.yaml")).toBe("users/ada/brain.yaml");
  });
});
