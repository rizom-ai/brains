import { join } from "node:path";

/**
 * The files at the root of the plugin's public repository, by name: what
 * Obsidian reads a community plugin from. The built plugin itself goes into
 * that repository's releases, not its tree.
 */
export async function publicRepoFiles(
  root: string,
): Promise<Record<string, string>> {
  const read = (path: string): Promise<string> =>
    Bun.file(join(root, path)).text();
  return {
    "README.md": await read("public/README.md"),
    // The repository's license, which is this package's.
    LICENSE: await read("../../LICENSE"),
    "manifest.json": await read("manifest.json"),
    "versions.json": await read("versions.json"),
  };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const out = process.argv[2] ?? join(root, "dist", "public-repo");
  for (const [name, content] of Object.entries(await publicRepoFiles(root))) {
    await Bun.write(join(out, name), content);
  }
  console.log(`Wrote ${out}`);
}
