import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getCanonicalAtprotoLexicon,
  listCanonicalAtprotoLexicons,
} from "../src";

const expectedNsids = [
  "ai.rizom.brain.card",
  "ai.rizom.brain.deck",
  "ai.rizom.brain.link",
  "ai.rizom.brain.note",
  "ai.rizom.brain.post",
  "ai.rizom.brain.project",
  "ai.rizom.brain.series",
  "ai.rizom.brain.socialPost",
  "ai.rizom.brain.topic",
];

function findDuplicateLexiconFiles(root: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDuplicateLexiconFiles(fullPath));
      continue;
    }
    if (
      entry.isFile() &&
      /^ai\.rizom\.brain\..*\.json$/.test(entry.name) &&
      !fullPath.includes("shared/atproto-contracts/src/lexicons/")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("canonical ATProto lexicons", () => {
  it("exports every canonical Rizom brain lexicon", () => {
    const lexicons = listCanonicalAtprotoLexicons();

    expect(lexicons.map((lexicon) => lexicon.id).sort()).toEqual(
      [...expectedNsids].sort(),
    );
    for (const lexicon of lexicons) {
      expect(lexicon.lexicon).toBe(1);
      expect(lexicon.defs.main.type).toBe("record");
      expect(lexicon.defs.main.record.type).toBe("object");
      expect(getCanonicalAtprotoLexicon(lexicon.id)).toBe(lexicon);
    }
  });

  it("keeps canonical ai.rizom.brain JSON only in atproto-contracts", () => {
    expect(
      findDuplicateLexiconFiles(join(import.meta.dir, "../../..")),
    ).toEqual([]);
  });
});
