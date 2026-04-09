import { readFileSync } from "fs";
import { describe, expect, it } from "bun:test";
import { join } from "path";
import { getAvailableModels } from "../src/lib/model-registry";

const entrypointPath = join(import.meta.dir, "..", "scripts", "entrypoint.ts");

describe("bundled model set", () => {
  it("lists rover, ranger, and relay as built-in models", () => {
    expect(getAvailableModels()).toEqual(["rover", "ranger", "relay"]);
  });

  it("registers rover, ranger, and relay in the bundled entrypoint", () => {
    const entrypoint = readFileSync(entrypointPath, "utf-8");

    expect(entrypoint).toContain('import rover from "@brains/rover";');
    expect(entrypoint).toContain('import ranger from "@brains/ranger";');
    expect(entrypoint).toContain('import relay from "@brains/relay";');
    expect(entrypoint).toContain('registerModel("rover", rover);');
    expect(entrypoint).toContain('registerModel("ranger", ranger);');
    expect(entrypoint).toContain('registerModel("relay", relay);');
  });
});
