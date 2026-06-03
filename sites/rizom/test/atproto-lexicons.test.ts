import { describe, expect, it } from "bun:test";
import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import {
  RIZOM_ATPROTO_LEXICON_BASE_PATH,
  rizomAtprotoLexiconStaticAssets,
} from "../src/runtime/plugin";

const expectedPaths = listCanonicalAtprotoLexicons().map(
  (lexicon) => `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.id}.json`,
);

describe("Rizom ATProto public lexicons", () => {
  it("serves contract-owned lexicon JSON under /atproto/lexicons", () => {
    for (const lexicon of listCanonicalAtprotoLexicons()) {
      const publicPath = `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.id}.json`;
      const staticAsset = rizomAtprotoLexiconStaticAssets[publicPath];

      expect(staticAsset).toBeDefined();
      expect(JSON.parse(staticAsset ?? "{}")).toEqual(lexicon);
    }
  });

  it("publishes only the canonical Rizom ATProto lexicons", () => {
    expect(Object.keys(rizomAtprotoLexiconStaticAssets).sort()).toEqual(
      [...expectedPaths].sort(),
    );
  });
});
