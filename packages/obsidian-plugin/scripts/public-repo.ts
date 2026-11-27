import { join } from "node:path";

/**
 * The files of the plugin's public repository, by path: what Obsidian reads
 * a community plugin from, and a copy of the source under `src/` so a
 * reviewer finds it next to the plugin. The built plugin itself goes into
 * that repository's releases, not its tree.
 */
export async function publicRepoFiles(
  root: string,
): Promise<Record<string, string>> {
  const read = (path: string): Promise<string> =>
    Bun.file(join(root, path)).text();
  const source = await Promise.all(
    [...new Bun.Glob("src/**/*.ts").scanSync(root)].map(
      async (path): Promise<[string, string]> => [path, await read(path)],
    ),
  );
  return {
    ...Object.fromEntries(source),
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
