import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import bootScript from "./boot/boot.boot.js" with { type: "text" };
import storyStyles from "../../story.css" with { type: "text" };
import writingStyles from "../../writing.css" with { type: "text" };
import favicon from "../../favicon.svg" with { type: "text" };
import { brainOrganism } from "../../story/brain-organism";
import { foundationOrganism } from "../../story/foundation-organism";
import { livingOrganism } from "../../story/living-organism";
import { workOrganism } from "../../story/work-organism";
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

export const rizomRuntimeStaticAssets: Record<string, string> = {
  ...rizomAtprotoLexiconStaticAssets,
  // The site's icon: the lantern the drawings use for a brain.
  "/favicon.svg": favicon,
  "/boot.js": bootScript,
  "/story.js": storyRuntimeScript,
  // The story pages: the page shape, the drawings and the reading thread.
  "/styles/story.css":
    storyStyles +
    ASK_ROOM_STYLES +
    livingOrganism.css() +
    brainOrganism.css() +
    workOrganism.css() +
    foundationOrganism.css(),
  "/styles/writing.css": writingStyles,
};
