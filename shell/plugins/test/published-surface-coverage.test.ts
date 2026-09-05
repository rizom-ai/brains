import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeps `public-surface-soundness.test.ts` exhaustive.
 *
 * That file asserts each published type against its runtime counterpart, but
 * the assertions are written by hand: a new declaration on the published
 * surface arrives unasserted and nothing notices. The two surfaces are
 * independent declarations of the same types — no `extends`, no shared
 * source — so an unasserted pair is free to drift, which is how the published
 * `InsightHandler` came to promise a read-only entity service while the
 * runtime required the full one.
 *
 * A published name is in scope when some package declares the same name — not
 * only `@brains/plugins` itself. `Logger` and `PluginFactory` are restated
 * here from `@brains/utils` and `@brains/app`, are not re-exported by this
 * package's index, and so went unchecked while the check looked no further
 * than that index. A published type nothing else declares has nothing to be
 * checked against and is left alone.
 */

const repositoryRoot = join(import.meta.dir, "..", "..", "..");
const pluginsRoot = join(import.meta.dir, "..");

/**
 * Pairs where assignability is the wrong question, and why.
 *
 * Listed rather than left unasserted, so skipping a pair takes a stated
 * reason instead of an omission nobody notices.
 */
const NOT_ASSIGNABILITY = new Map([
  [
    "PluginConfig",
    "runtime maps a zod schema to its output; the SDK restates it as a plain " +
      "Record so plugin authors need no zod types",
  ],
  [
    "PluginConfigInput",
    "runtime takes a ZodType; the SDK takes a structural `{ _input }` stand-in " +
      "for the same reason",
  ],
  [
    "PluginFactory",
    "its runtime counterpart is `@brains/app`'s, and app depends on this " +
      "package — importing it back would close a cycle turbo cannot schedule, " +
      "so the assertion lives in app's brain-definition.test.ts instead",
  ],
]);

/** Names a module declares itself, as opposed to re-exporting. */
function locallyDeclared(file: string): Set<string> {
  const source = readFileSync(file, "utf-8");
  const names = new Set<string>();
  for (const match of source.matchAll(
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:type|interface|class|function|const|enum)\s+([A-Za-z0-9_]+)/gm,
  )) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

/** Shipped source directories a runtime counterpart could live in. */
const SOURCE_ROOTS = [
  "shell",
  "shared",
  "plugins",
  "entities",
  "interfaces",
  "packages",
];

/** Type names declared in shipped source anywhere but the published surface. */
function declaredElsewhere(): Set<string> {
  const publishedSurface = join(pluginsRoot, "src/public/types.ts");
  const names = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        if (entry.name === "test" || entry.name === "tests") continue;
        if (entry.name === "fixtures" || entry.name === "dist") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      if (entry.name.includes(".test.")) continue;
      if (path === publishedSurface) continue;
      for (const name of locallyDeclared(path)) names.add(name);
    }
  };

  for (const root of SOURCE_ROOTS) {
    const directory = join(repositoryRoot, root);
    if (!existsSync(directory)) continue;
    walk(directory);
  }
  return names;
}

describe("published plugin surface coverage", () => {
  test("every published type another package also declares is asserted", () => {
    const published = locallyDeclared(join(pluginsRoot, "src/public/types.ts"));
    const soundness = readFileSync(
      join(pluginsRoot, "test/public-surface-soundness.ts"),
      "utf-8",
    );

    const asserted = new Set(
      [...soundness.matchAll(/\bPublic\.([A-Za-z0-9_]+)/g)].flatMap(
        (match) => match[1] ?? [],
      ),
    );

    const elsewhere = declaredElsewhere();
    const unasserted = [...published]
      .filter((name) => elsewhere.has(name))
      .filter((name) => !asserted.has(name))
      .filter((name) => !NOT_ASSIGNABILITY.has(name))
      .sort();

    expect(unasserted).toEqual([]);
  });

  test("every documented exclusion is still a published type", () => {
    // An exclusion that outlives the declaration it excuses would quietly
    // widen the check's blind spot.
    const published = locallyDeclared(join(pluginsRoot, "src/public/types.ts"));

    expect(
      [...NOT_ASSIGNABILITY.keys()].filter((name) => !published.has(name)),
    ).toEqual([]);
  });
});
