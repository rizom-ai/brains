import { describe, expect, it } from "bun:test";
import {
  RIZOM_ATPROTO_LEXICON_BASE_PATH,
  rizomAtprotoLexiconStaticAssets,
} from "../src/runtime/plugin";

const lexicons = [
  {
    nsid: "ai.rizom.brain.card",
    ownerPath: "../../plugins/atproto/lexicons/ai.rizom.brain.card.json",
  },
  {
    nsid: "ai.rizom.brain.post",
    ownerPath: "../../entities/blog/lexicons/ai.rizom.brain.post.json",
  },
  {
    nsid: "ai.rizom.brain.note",
    ownerPath: "../../entities/note/lexicons/ai.rizom.brain.note.json",
  },
  {
    nsid: "ai.rizom.brain.link",
    ownerPath: "../../entities/link/lexicons/ai.rizom.brain.link.json",
  },
  {
    nsid: "ai.rizom.brain.deck",
    ownerPath: "../../entities/decks/lexicons/ai.rizom.brain.deck.json",
  },
  {
    nsid: "ai.rizom.brain.socialPost",
    ownerPath:
      "../../entities/social-media/lexicons/ai.rizom.brain.socialPost.json",
  },
  {
    nsid: "ai.rizom.brain.series",
    ownerPath: "../../entities/series/lexicons/ai.rizom.brain.series.json",
  },
  {
    nsid: "ai.rizom.brain.project",
    ownerPath: "../../entities/portfolio/lexicons/ai.rizom.brain.project.json",
  },
  {
    nsid: "ai.rizom.brain.topic",
    ownerPath: "../../entities/topics/lexicons/ai.rizom.brain.topic.json",
  },
] as const;

describe("Rizom ATProto public lexicons", () => {
  it("serves canonical lexicon JSON under /atproto/lexicons", async () => {
    for (const lexicon of lexicons) {
      const publicPath = `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.nsid}.json`;
      const staticAsset = rizomAtprotoLexiconStaticAssets[publicPath];
      const ownerJson = await Bun.file(lexicon.ownerPath).json();

      expect(staticAsset).toBeDefined();
      expect(JSON.parse(staticAsset ?? "{}")).toEqual(ownerJson);
    }
  });

  it("publishes only the expected Rizom ATProto lexicons", () => {
    expect(Object.keys(rizomAtprotoLexiconStaticAssets).sort()).toEqual(
      lexicons
        .map(
          (lexicon) =>
            `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.nsid}.json`,
        )
        .sort(),
    );
  });
});
