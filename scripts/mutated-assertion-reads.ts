import { join } from "node:path";

/**
 * Find reads of a field that `toMatchObject` has already replaced.
 *
 * Bun mutates the *received* object when a field is matched by an asymmetric
 * matcher: after
 *
 * ```ts
 * expect(options).toMatchObject({ challenge: expect.any(String) });
 * ```
 *
 * `options.challenge` is the matcher, not the challenge. A literal match does
 * not mutate, and neither does `toEqual` or `toHaveProperty` — only
 * `toMatchObject` with `expect.anything()`, `expect.any()`,
 * `expect.stringContaining()` and friends.
 *
 * That is silent: the assertion passes, and so does whatever the test does
 * with the field afterwards, because it is comparing a matcher to a matcher or
 * sending one over the wire. One auth test built a WebAuthn client-data blob
 * from a challenge that had become the matcher, so it proved a rejection for
 * the wrong reason.
 *
 * Reach for, in order: assert the field on its own line
 * (`expect(x.challenge).not.toBe("")`) and leave it out of the object match;
 * or match against a parsed copy and read from the original.
 */
export interface MutatedAssertionRead {
  file: string;
  /** Line of the `toMatchObject` call that replaces the field. */
  matchLine: number;
  /** The received expression, e.g. `passkeyOptions`. */
  received: string;
  /** The field the matcher replaces. */
  key: string;
  /** Line where the replaced field is read back. */
  readLine: number;
}

function matchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index++) {
    const character = text[index];
    if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** End of the enclosing `it()`/`test()` block, so reads do not leak across tests. */
function enclosingBlockEnd(text: string, from: number): number {
  const nextBlock = /\n\s{2}(?:it|test)(?:\.\w+)?\s*\(/g;
  nextBlock.lastIndex = from;
  const hit = nextBlock.exec(text);
  return hit ? hit.index : text.length;
}

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** Scan one file's source. Exported for the guard test. */
export function findMutatedAssertionReadsInSource(
  file: string,
  text: string,
): MutatedAssertionRead[] {
  const found: MutatedAssertionRead[] = [];
  const call = /expect\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\.toMatchObject\(\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = call.exec(text)) !== null) {
    const received = match[1];
    if (!received) continue;

    const braceStart = text.indexOf("{", match.index + match[0].length - 1);
    const braceEnd = matchingBrace(text, braceStart);
    if (braceEnd < 0) continue;

    const body = text.slice(braceStart, braceEnd + 1);
    if (!body.includes("expect.")) continue;

    const keys = new Set<string>();
    const keyPattern = /(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:\s*expect\./g;
    let key: RegExpExecArray | null;
    while ((key = keyPattern.exec(body)) !== null) {
      if (key[1]) keys.add(key[1]);
    }
    if (keys.size === 0) continue;

    const after = text.slice(braceEnd, enclosingBlockEnd(text, braceEnd));
    for (const name of keys) {
      const read = new RegExp(
        `\\b${received}\\s*(?:\\?\\.)?(?:\\.${name}\\b|\\[\\s*["']${name}["']\\s*\\])` +
          `|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*${received}\\b`,
      );
      const hit = read.exec(after);
      if (!hit) continue;
      found.push({
        file,
        matchLine: lineAt(text, match.index),
        received,
        key: name,
        readLine: lineAt(text, braceEnd + hit.index),
      });
    }
  }

  return found;
}

/**
 * Scan every tracked test file under `root`.
 *
 * Enumeration goes through `git ls-files` rather than a glob walk: the glob
 * would descend into every package's `node_modules`.
 */
export async function findMutatedAssertionReads(
  root: string,
): Promise<MutatedAssertionRead[]> {
  const listed = Bun.spawnSync({
    cmd: ["git", "ls-files", "-z", "*.test.ts", "*.test.tsx"],
    cwd: root,
  });
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-files failed in ${root}`);
  }

  const files = listed.stdout
    .toString()
    .split("\0")
    .filter((file) => file !== "");

  const found: MutatedAssertionRead[] = [];
  for (const file of files) {
    const text = await Bun.file(join(root, file)).text();
    found.push(...findMutatedAssertionReadsInSource(file, text));
  }

  return found.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.matchLine - right.matchLine,
  );
}
