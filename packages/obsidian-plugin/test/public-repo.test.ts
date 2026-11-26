import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { publicRepoFiles } from "../scripts/public-repo";

const root = join(import.meta.dir, "..");
const manifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  minAppVersion: z.string(),
  description: z.string(),
  author: z.string(),
  isDesktopOnly: z.boolean(),
});

/**
 * Obsidian reads a plugin from its own public repository: README.md,
 * LICENSE and manifest.json at the root, and releases tagged with the
 * manifest's version. These hold what is published to Obsidian's rules
 * (docs.obsidian.md, Submit your plugin and Reference/Manifest).
 */
describe("what is published as the plugin's repository", () => {
  it("has the files Obsidian reads at its root", async () => {
    const files = await publicRepoFiles(root);

    expect(Object.keys(files).sort()).toEqual([
      "LICENSE",
      "README.md",
      "manifest.json",
      "versions.json",
    ]);
    expect(files["LICENSE"]).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  });

  it("has a manifest Obsidian accepts", async () => {
    const files = await publicRepoFiles(root);
    const manifest = manifestSchema.parse(
      JSON.parse(files["manifest.json"] ?? ""),
    );

    // Only lowercase letters and hyphens; not "obsidian"; not ending in "plugin".
    expect(manifest.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(manifest.id).not.toContain("obsidian");
    expect(manifest.id.endsWith("plugin")).toBe(false);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.name).toMatch(/^[A-Za-z0-9 +()-]+$/);
    expect(manifest.name).not.toMatch(/obsidian|obsi-|-sidian|plugin/i);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.isDesktopOnly).toBe(false);
  });

  it("says which Obsidian the current version needs", async () => {
    const files = await publicRepoFiles(root);
    const manifest = manifestSchema.parse(
      JSON.parse(files["manifest.json"] ?? ""),
    );
    const versions = z
      .record(z.string(), z.string())
      .parse(JSON.parse(files["versions.json"] ?? ""));

    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it("tells a reader what the plugin sends, stores and changes", async () => {
    const readme = (await publicRepoFiles(root))["README.md"] ?? "";

    // What a person must know before installing.
    expect(readme).toContain("your brain's address");
    // Which brain it works with: the first with the sync endpoints.
    expect(readme).toMatch(/version \d+\.\d+\.\d+(-alpha\.\d+)? or later/);
    expect(readme).toContain("app password");
    expect(readme).toContain("data.json");
    expect(readme).toContain("No telemetry");
    expect(readme).toContain("AGPL");
  });
});
