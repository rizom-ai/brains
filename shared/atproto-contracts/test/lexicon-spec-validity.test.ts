import { describe, expect, it } from "bun:test";
import { parseLexiconDoc } from "@atproto/lexicon";
import { listCanonicalAtprotoLexicons } from "../src";

// Third-party viewers resolve our schemas via com.atproto.lexicon.schema
// records and validate them with the official lexicon parser. A document the
// parser rejects (e.g. inline nested objects instead of refs) resolves as
// "invalid lexicon schema" for every consumer, so spec validity is a contract.
describe("canonical lexicon spec validity", () => {
  for (const lexicon of listCanonicalAtprotoLexicons()) {
    it(`${lexicon.id} parses with the official @atproto/lexicon parser`, () => {
      expect(() => parseLexiconDoc(structuredClone(lexicon))).not.toThrow();
    });
  }
});
