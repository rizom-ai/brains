import type { JSX } from "preact";
import type { EnrichedDeckListData } from "./schema";
import { ContentSection, type ContentItem } from "@brains/ui-library";

export const DeckListLayout = ({
  decks,
  pageTitle,
}: EnrichedDeckListData): JSX.Element => {
  // Map decks to ContentItem format
  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.title,
    date: deck.presentedAt ?? deck.created,
    description: deck.description,
  }));

  return (
    <div className="deck-list bg-theme">
      <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
        <ContentSection
          title={pageTitle ?? "Presentations"}
          items={deckItems}
        />
      </div>
    </div>
  );
};
