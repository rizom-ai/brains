import type { JSX } from "preact";
import type { EnrichedDeckListData } from "./schema";
import { ContentArchive, type ContentItem } from "@brains/ui-library";

export const DeckListLayout = ({
  decks,
  pageTitle,
}: EnrichedDeckListData): JSX.Element => {
  // Map decks to ContentItem format
  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.frontmatter.title,
    date: deck.frontmatter.publishedAt ?? deck.created,
    description: deck.frontmatter.description,
  }));

  return (
    <div className="deck-list bg-theme">
      <div className="container mx-auto max-w-[1100px] px-6 py-16 md:px-12 md:py-24">
        <ContentArchive
          title={pageTitle ?? "Presentations"}
          items={deckItems}
        />
      </div>
    </div>
  );
};
