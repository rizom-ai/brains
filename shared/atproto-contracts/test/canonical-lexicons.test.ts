import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getCanonicalAtprotoLexicon,
  getCanonicalAtprotoLexiconMetadata,
  listCanonicalAtprotoLexiconMetadata,
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

  it("exports governance metadata for every canonical Rizom brain lexicon", () => {
    const metadata = listCanonicalAtprotoLexiconMetadata();

    expect(metadata.map((entry) => String(entry.id)).sort()).toEqual(
      [...expectedNsids].sort(),
    );
    for (const entry of metadata) {
      expect(getCanonicalAtprotoLexicon(entry.id)).toBeDefined();
      expect(getCanonicalAtprotoLexiconMetadata(entry.id)).toEqual(entry);
      expect(entry.status).toBe("approved");
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.revision).toBeGreaterThan(0);
      expect(entry.owner).toBe("Rizom");
      expect(entry.steward).toBe("Rizom protocol registry");
      expect(entry.projectionPackage).toMatch(/^@brains\//);
      expect(entry.compatibility).toContain("required-field");
    }
  });

  it("keeps canonical ai.rizom.brain JSON only in atproto-contracts", () => {
    expect(
      findDuplicateLexiconFiles(join(import.meta.dir, "../../..")),
    ).toEqual([]);
  });
});
