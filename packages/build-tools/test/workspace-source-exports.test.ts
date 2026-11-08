import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createTempDir } from "@brains/test-utils";
import { preparePublishManifest } from "../src/publish-manifest";
import { runWithPreparedPublishManifests } from "../src/publish-workspace";
import { workspaceSourceExports } from "../src/workspace-source-exports";

/**
 * A workspace shaped like the release: a published library whose source
 * manifest exports a first-party subpath its published manifest leaves out,
 * and a consumer that bundles that subpath, the way @rizom/brain bundles
 * entity templates importing @rizom/brain-ui/internal.
 */
async function createWorkspace(): Promise<{
  root: string;
  library: string;
  entry: string;
}> {
  const root = await createTempDir("workspace-source-exports-");
  const library = join(root, "packages", "ui");
  await mkdir(join(library, "src"), { recursive: true });
  await writeFile(
    join(library, "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/ui",
        version: "1.0.0",
        exports: {
          ".": "./src/index.ts",
          "./internal": "./src/internal.ts",
        },
        publishExports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(library, "src", "index.ts"),
    'export const publicName = "public-entry";\n',
  );
  await writeFile(
    join(library, "src", "internal.ts"),
    'export const firstPartyName = "internal-entry";\n',
  );
  await mkdir(join(root, "node_modules", "@fixture"), { recursive: true });
  await symlink(library, join(root, "node_modules", "@fixture", "ui"));

  const entry = join(root, "app", "index.ts");
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(
    entry,
    [
      'import { publicName } from "@fixture/ui";',
      'import { firstPartyName } from "@fixture/ui/internal";',
      "console.log(publicName, firstPartyName);",
      "",
    ].join("\n"),
  );
  return { root, library, entry };
}

async function bundle(
  entry: string,
  plugins: Bun.BunPlugin[],
): Promise<{ success: boolean; text: string }> {
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      plugins,
      throw: false,
    });
    const [output] = result.outputs;
    return {
      success: result.success,
      text: output ? await output.text() : result.logs.join("\n"),
    };
  } catch (error) {
    return { success: false, text: String(error) };
  }
}

describe("workspaceSourceExports", () => {
  test("a bundle reaches a first-party subpath while the library's publish manifest is prepared", async () => {
    const { root, library, entry } = await createWorkspace();

    await runWithPreparedPublishManifests([library], async () => {
      // The release order: the published manifest drops ./internal.
      const unaided = await bundle(entry, []);
      expect(unaided.success).toBe(false);

      const resolved = await bundle(entry, [workspaceSourceExports({ root })]);
      expect(resolved.success).toBe(true);
      expect(resolved.text).toContain("internal-entry");
      expect(resolved.text).toContain("public-entry");
    });
  });

  test("resolves the same source files when no manifest is prepared", async () => {
    const { root, entry } = await createWorkspace();

    const resolved = await bundle(entry, [workspaceSourceExports({ root })]);
    expect(resolved.success).toBe(true);
    expect(resolved.text).toContain("internal-entry");
    expect(resolved.text).toContain("public-entry");
  });

  test("refuses a subpath the source manifest does not export", async () => {
    const { root, library } = await createWorkspace();
    await preparePublishManifest(library);
    const entry = join(root, "app", "unknown.ts");
    await writeFile(entry, 'import "@fixture/ui/missing";\n');

    const resolved = await bundle(entry, [workspaceSourceExports({ root })]);
    expect(resolved.success).toBe(false);
    expect(resolved.text).toContain("@fixture/ui/missing");
  });
});
