import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ENTITY_CHANNELS, PUBLISH_CHANNELS } from "@brains/contracts";
import {
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
  studioOverviewContributionRegisterContract,
  studioOverviewContributionUnregisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
} from "../src";

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
    expect(dashboardWidgetRegisterContract.name).toBe(
      "dashboard:register-widget",
    );
    expect(studioOverviewContributionRegisterContract.name).toBe(
      "studio:register-overview-contribution",
    );
    expect(studioOverviewContributionUnregisterContract.name).toBe(
      "studio:unregister-overview-contribution",
    );
    expect(dashboardWidgetUnregisterContract.name).toBe(
      "dashboard:unregister-widget",
    );
    expect(studioWorkspaceRegisterContract.name).toBe(
      "studio:register-workspace",
    );
    expect(studioWorkspaceUnregisterContract.name).toBe(
      "studio:unregister-workspace",
    );
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
