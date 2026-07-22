import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  DASHBOARD_CHANNELS,
  ENTITY_CHANNELS,
  PUBLISH_CHANNELS,
} from "@brains/contracts";

const repoRoot = join(import.meta.dir, "../../..");

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".turbo") {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\/src\/.*\.(ts|tsx)$/.test(path)) {
      yield path;
    }
  }
}

describe("message channels", () => {
  it("keeps common domain channel constants stable", () => {
    expect(PUBLISH_CHANNELS.completed).toBe("publish:completed");
    expect(ENTITY_CHANNELS.updated).toBe("entity:updated");
    expect(DASHBOARD_CHANNELS.registerWidget).toBe("dashboard:register-widget");
  });

  it("does not hardcode message-bus event literals at source call sites", () => {
    const violations: string[] = [];
    const subscribeLiteralPattern =
      /(?:\.|\b)subscribe(?:<[^>]+>)?\(\s*["'`][a-z][^"'`]*[:][^"'`]*["'`]/g;
    const sendLiteralPattern =
      /(?:\.|\b)send(?:<[^>]+>)?\(\s*\{\s*type:\s*["'`][a-z][^"'`]*[:][^"'`]*["'`]/g;

    for (const file of sourceFiles(repoRoot)) {
      const relativePath = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const pattern of [subscribeLiteralPattern, sendLiteralPattern]) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(`${relativePath}:${line}: ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
