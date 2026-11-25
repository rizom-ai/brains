import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import bootScript from "./boot/boot.boot.js" with { type: "text" };
import storyStyles from "../../story.css" with { type: "text" };
import writingStyles from "../../writing.css" with { type: "text" };
import favicon from "../../favicon.svg" with { type: "text" };
import type { Organism } from "../../story/organism";
import { storyRuntimeScript } from "../../story/runtime";
import { ASK_ROOM_STYLES } from "@brains/site-atlas";

export function buildRizomHeadScript(): string {
  return `<script src="/boot.js" defer></script><script src="/story.js" defer></script>`;
}

export const RIZOM_ATPROTO_LEXICON_BASE_PATH = "/atproto/lexicons";

function formatLexiconJson(lexicon: unknown): string {
  return `${JSON.stringify(lexicon, null, 2)}\n`;
}

export const rizomAtprotoLexiconStaticAssets: Record<string, string> =
  Object.fromEntries(
    listCanonicalAtprotoLexicons().map((lexicon) => [
      `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.id}.json`,
      formatLexiconJson(lexicon),
    ]),
  );

export const STORY_STYLESHEET_PATH = "/styles/story.css";

/** The story pages' stylesheet: the page shape, the reading thread and the given drawings. */
export function storyStylesheet(organisms: readonly Organism[] = []): string {
  return (
    storyStyles +
    ASK_ROOM_STYLES +
    organisms.map((drawing) => drawing.css()).join("")
  );
}

/**
 * What every Rizom site serves. A site's own drawings join the story
 * stylesheet through `createRizomSite`; the ATProto lexicons are rizom.ai's
 * alone, as their authority.
 */
export const rizomRuntimeStaticAssets: Record<string, string> = {
  // The site's icon: the lantern the drawings use for a brain.
  "/favicon.svg": favicon,
  "/boot.js": bootScript,
  "/story.js": storyRuntimeScript,
  // The story pages: the page shape and the reading thread.
  [STORY_STYLESHEET_PATH]: storyStylesheet(),
  "/styles/writing.css": writingStyles,
};
