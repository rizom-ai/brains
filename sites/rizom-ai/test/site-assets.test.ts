import { describe, expect, test } from "bun:test";
import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import * as pkg from "../src";
import { rizomAiSite } from "../src/site";
import { brainOrganism } from "../src/story/brain-organism";
import { livingOrganism } from "../src/story/living-organism";

describe("rizom.ai's static files", () => {
  test("the story stylesheet carries its two drawings", () => {
    const css = rizomAiSite.staticAssets?.["/styles/story.css"] ?? "";
    for (const drawing of [livingOrganism, brainOrganism]) {
      expect(css).toContain(drawing.css());
    }
  });

  test("rizom.ai serves the ATProto lexicons it is the authority for", () => {
    for (const lexicon of listCanonicalAtprotoLexicons()) {
      expect(
        rizomAiSite.staticAssets?.[`/atproto/lexicons/${lexicon.id}.json`],
      ).toBeDefined();
    }
  });
});

describe("what another Rizom site builds on", () => {
  test("the package exports the story page, the drawing builder and the site layout", () => {
    for (const name of [
      "StoryPage",
      "ReadingThread",
      "organism",
      "placed",
      "gathered",
      "ring",
      "scatter",
      "emphasize",
      "createSiteLayout",
      "threeSiteFooter",
    ] as const) {
      expect(typeof pkg[name]).toBe("function");
    }
  });
});
