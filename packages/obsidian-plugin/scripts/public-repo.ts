import { join } from "node:path";

/**
 * The files of the plugin's public repository, by path: what Obsidian reads
 * a community plugin from, and a copy of the source under `src/` so a
 * reviewer finds it next to the plugin: the sync engine, from its own
 * package, under `src/vault-sync/`. The built plugin itself goes into that
 * repository's releases, not its tree.
 */
export async function publicRepoFiles(
  root: string,
): Promise<Record<string, string>> {
  const read = (path: string): Promise<string> =>
    Bun.file(join(root, path)).text();
  const engineRoot = join(root, "..", "vault-sync");
  const source = await Promise.all(
    [...new Bun.Glob("src/**/*.ts").scanSync(root)].map(
      async (path): Promise<[string, string]> => [path, await read(path)],
    ),
  );
  // The engine's own files; its test brain is not part of the plugin.
  const engine = await Promise.all(
    [...new Bun.Glob("src/*.ts").scanSync(engineRoot)].map(
      async (path): Promise<[string, string]> => [
        `src/vault-sync/${path.slice("src/".length)}`,
        await Bun.file(join(engineRoot, path)).text(),
      ],
    ),
  );
  return {
    ...Object.fromEntries(source),
    ...Object.fromEntries(engine),
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
