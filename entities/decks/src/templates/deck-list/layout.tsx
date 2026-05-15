import type { JSX } from "preact";
import type { EnrichedDeckListData } from "./schema";
import { ContentArchive, type ContentItem } from "@brains/ui-library";

const DECK_DISPLAY_LABEL = "Presentations";

export const DeckListLayout = ({
  decks,
  pageLabel,
}: EnrichedDeckListData): JSX.Element => {
  // Map decks to ContentItem format
  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.frontmatter.title,
    date: deck.frontmatter.publishedAt ?? deck.created,
    description: deck.frontmatter.description,
  }));

  const label =
    pageLabel && pageLabel !== "Decks" ? pageLabel : DECK_DISPLAY_LABEL;

  return (
    <div className="deck-list bg-theme">
      <div className="container mx-auto max-w-[1100px] px-6 py-16 md:px-12 md:py-24">
        <ContentArchive label={label} items={deckItems} />
      </div>
    </div>
  );
};
