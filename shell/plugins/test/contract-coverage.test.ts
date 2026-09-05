import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeps `contract-fidelity.test.ts` exhaustive.
 *
 * Each `src/contracts/*` module restates types owned by one shell service.
 * The assertions that hold a restatement to its service are written by hand,
 * so a new copy arrives unasserted and drifts unnoticed — which is how the
 * contract `MessageContext` came to declare every field optional and
 * `timestamp` as a string while the bus delivered all of them and a `Date`.
 *
 * A contract type is in scope when the service exports the same name. One
 * that does not is the contract's own vocabulary and has nothing to be
 * checked against.
 */

const repositoryRoot = join(import.meta.dir, "..", "..", "..");
const pluginsRoot = join(import.meta.dir, "..");

/** Contract module -> the service whose types it restates. */
const RESTATES = [
  { contract: "messaging", service: "shell/messaging-service" },
  { contract: "identity", service: "shell/identity-service" },
  { contract: "agent", service: "shell/ai-service" },
  { contract: "conversations", service: "shell/conversation-service" },
] as const;

/**
 * Pairs deliberately left unasserted, and why.
 *
 * Named rather than omitted, so skipping one costs a stated reason.
 */
const NOT_A_COPY = new Map([
  [
    "Conversation",
    "the service's is a drizzle row, the contract's is the mapped form; " +
      "base/public-conversations.ts converts and its return types hold the pair",
  ],
  [
    "Message",
    "same mapping as Conversation: `role` is narrowed and `metadata` parsed " +
      "on the way out",
  ],
]);

/** Names a module declares itself. */
function locallyDeclared(file: string): Set<string> {
  const names = new Set<string>();
  for (const match of readFileSync(file, "utf-8").matchAll(
    /^export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/gm,
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

describe("plugin contract coverage", () => {
  test("every restated service type is asserted", () => {
    const fidelity = readFileSync(
      join(pluginsRoot, "test/contract-fidelity.test.ts"),
      "utf-8",
    );
    // The fidelity test imports each contract module under its own alias:
    // `MessagingContract.BaseMessage`, `IdentityContract.AnchorProfile`.
    const asserted = new Set(
      [...fidelity.matchAll(/\b[A-Za-z]*Contract\.([A-Za-z0-9_]+)/g)].flatMap(
        (match) => match[1] ?? [],
      ),
    );

    const unasserted = RESTATES.flatMap(({ contract, service }) => {
      const declared = locallyDeclared(
        join(pluginsRoot, `src/contracts/${contract}.ts`),
      );
      const owned = exported(join(repositoryRoot, service, "src/index.ts"));
      return [...declared]
        .filter((name) => owned.has(name))
        .filter((name) => !asserted.has(name))
        .filter((name) => !NOT_A_COPY.has(name))
        .map((name) => `${contract}: ${name}`);
    }).sort();

    expect(unasserted).toEqual([]);
  });
});
