import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SYSTEM_CHANNELS } from "../src/system-channels";

const hardcodedSystemChannelPattern = /["'`]system:[a-z0-9:-]+["'`]/g;

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".turbo" ||
      entry.name === ".git"
    ) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }

    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    if (!path.includes("/src/")) continue;
    files.push(path);
  }
  return files;
}

describe("system channels", () => {
  it("names the registration coordination signal honestly", () => {
    expect(SYSTEM_CHANNELS.pluginsRegistered).toBe("system:plugins:registered");
  });

  it("does not hardcode system lifecycle channel literals outside the contract", () => {
    const root = join(import.meta.dir, "../../..");
    const offenders = listSourceFiles(root).flatMap((file) => {
      if (file.endsWith("shell/plugins/src/system-channels.ts")) return [];
      if (statSync(file).size === 0) return [];
      const matches = readFileSync(file, "utf8").match(
        hardcodedSystemChannelPattern,
      );
      return matches ? [`${relative(root, file)}: ${matches.join(", ")}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});
