import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  BUILT_IN_PROFILE_KINDS,
  validateProfileContent,
} from "@brains/profile";
import rover from "../src";

const contentRoot = new URL("../", import.meta.url).pathname;

async function anchorProfileFixtures(): Promise<string[]> {
  const entries = await readdir(contentRoot, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith("seed-content") ||
          entry.name.startsWith("eval-content")),
    )
    .map((entry) => join(contentRoot, entry.name, "anchor-profile"))
    .map((dir) => join(dir, "anchor-profile.md"))
    .sort();
}

describe("rover anchor profile content", () => {
  it("selects a profile kind that covers the fields its onboarding playbook writes", () => {
    // The onboarding playbook mandates name, kind, role, audience and
    // expertise in the anchor-profile frontmatter. role and expertise live in
    // a profile kind's field schema, so without a selected kind the persist
    // validator rejects every profile the playbook writes.
    expect(rover.kind).toBe("professional");
  });

  it("validates every shipped anchor profile against the selected kind", async () => {
    const definition = BUILT_IN_PROFILE_KINDS.find(
      (candidate) => candidate.kind === rover.kind,
    );
    if (!definition) {
      throw new Error(
        `Rover selects an unregistered profile kind: ${rover.kind}`,
      );
    }

    const fixtures = await anchorProfileFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      const content = await readFile(fixture, "utf8");
      expect(() =>
        validateProfileContent(content, {
          category: definition.category,
          fields: definition.fields,
        }),
      ).not.toThrow();
    }
  });
});
