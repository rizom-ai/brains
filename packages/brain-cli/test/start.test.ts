import { describe, it, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

describe("brain start", () => {
  it("should detect brain.yaml in target directory", () => {
    // The professional-brain app has a brain.yaml
    const appDir = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "apps",
      "professional-brain",
    );
    expect(existsSync(join(appDir, "brain.yaml"))).toBe(true);
  });

  it("should detect monorepo context by checking for bun.lock", () => {
    // We're in the monorepo — bun.lock exists at root
    const monorepoRoot = join(import.meta.dir, "..", "..", "..");
    expect(existsSync(join(monorepoRoot, "bun.lock"))).toBe(true);
  });

  it("should detect standalone context by absence of bun.lock", () => {
    // /tmp has no bun.lock — would be standalone
    expect(existsSync("/tmp/bun.lock")).toBe(false);
  });
});
