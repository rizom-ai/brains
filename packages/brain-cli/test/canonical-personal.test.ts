import { describe, expect, test } from "bun:test";
import { resolve, type AppConfig } from "@brains/app";
import { expandBrainRecipe } from "../src/lib/brain-recipes";
import { canonicalBrain } from "../src/model/canonical-brain";

function pluginIds(resolved: AppConfig): string[] {
  return resolved.plugins?.map((plugin) => plugin.id) ?? [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pluginConfig(
  resolved: AppConfig,
  id: string,
): Record<string, unknown> | undefined {
  const plugin = resolved.plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  return isRecord(plugin.config) ? plugin.config : undefined;
}

describe("canonical personal posture", () => {
  test("expands to a private console without a public site", () => {
    expect(expandBrainRecipe("personal")).toEqual({
      bundleContract: "capability-bundles-v1",
      anchor: "person",
      kind: "professional",
      bundles: ["core", "media", "web", "chat"],
      plugins: {
        "directory-sync": { seedContentPath: "./seed-content" },
      },
    });
  });

  test("resolves media, browser administration, and chat independently", () => {
    const resolved = resolve(canonicalBrain, {}, expandBrainRecipe("personal"));
    const ids = pluginIds(resolved);

    for (const id of [
      "image",
      "document",
      "webserver",
      "dashboard",
      "web-chat",
      "conversation-memory",
    ]) {
      expect(ids).toContain(id);
    }
    for (const id of ["site-builder", "blog", "onboarding", "atproto"]) {
      expect(ids).not.toContain(id);
    }
    expect(pluginConfig(resolved, "mcp")).toMatchObject({ transport: "http" });
    expect(pluginConfig(resolved, "dashboard")).toMatchObject({
      routePath: "/",
    });
  });
});
