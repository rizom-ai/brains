import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REPOSITORY_ROOT = join(import.meta.dir, "..", "..", "..");
const SCANNED = ["entities", "plugins", "interfaces"];

/**
 * `shell:` templates are the shell's own, registered before any package
 * installs and never scoped to one.
 */
const SHELL_OWNED = /^shell:/u;

/**
 * Packages still built as classes. A class plugin registers under its bare
 * id, so `note:generation` is the name the registry actually holds — the
 * literal is correct until the package is converted, at which point the
 * conversion removes it along with this entry.
 */
const CLASS_PLUGIN_TEMPLATES = new Set(["note:generation"]);

/** `templateName: "…"` written as a literal rather than resolved. */
const LITERAL_TEMPLATE_NAME = /templateName:\s*"([^"]+)"/gu;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.tsx?$/u.test(entry.name) &&
        !entry.parentPath.includes("node_modules") &&
        !entry.parentPath.includes("/test/") &&
        !/\.test\.tsx?$/u.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("template name references", () => {
  // A declaration registers its templates under
  // `<packageName>:<entityType>:<local>`, and `ai.generate` looks the name up
  // by exact match with no scoping applied. Every name a package writes by
  // hand is the one it had before it was scoped: it keeps type-checking and
  // fails at generation time as "Template not found" — inside a background
  // job, where nothing user-facing reports it. `template(localName)` from the
  // job or eval context resolves it, and throws for a name the package does
  // not declare.
  it("resolves template names through the runtime rather than writing them", async () => {
    const offenders: string[] = [];

    for (const directory of SCANNED) {
      for (const file of await sourceFiles(join(REPOSITORY_ROOT, directory))) {
        const source = await readFile(file, "utf-8");
        for (const [, name] of source.matchAll(LITERAL_TEMPLATE_NAME)) {
          if (name === undefined) continue;
          if (SHELL_OWNED.test(name)) continue;
          if (CLASS_PLUGIN_TEMPLATES.has(name)) continue;
          offenders.push(`${file.slice(REPOSITORY_ROOT.length + 1)}: ${name}`);
        }
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
