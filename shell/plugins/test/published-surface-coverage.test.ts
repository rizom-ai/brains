import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
 * Only names the runtime also exports are in scope. A published type with no
 * runtime counterpart of the same name has nothing to be checked against.
 */

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

/** Every name a module exposes, its re-exports included. */
function exported(file: string): Set<string> {
  const source = readFileSync(file, "utf-8");
  const names = locallyDeclared(file);
  for (const block of source.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    const body = block[1];
    if (body === undefined) continue;
    for (const entry of body.split(",")) {
      const trimmed = entry.trim().replace(/^type\s+/, "");
      if (trimmed === "") continue;
      const parts = trimmed.split(/\s+as\s+/);
      const exposed = parts[parts.length - 1];
      if (exposed !== undefined) names.add(exposed);
    }
  }
  return names;
}

describe("published plugin surface coverage", () => {
  test("every published type the runtime also exports is asserted", () => {
    const published = locallyDeclared(join(pluginsRoot, "src/public/types.ts"));
    const runtime = exported(join(pluginsRoot, "src/index.ts"));
    const soundness = readFileSync(
      join(pluginsRoot, "test/public-surface-soundness.ts"),
      "utf-8",
    );

    const asserted = new Set(
      [...soundness.matchAll(/\bPublic\.([A-Za-z0-9_]+)/g)].flatMap(
        (match) => match[1] ?? [],
      ),
    );

    const unasserted = [...published]
      .filter((name) => runtime.has(name))
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
