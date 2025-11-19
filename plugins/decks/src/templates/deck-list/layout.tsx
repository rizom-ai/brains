import type { JSX } from "preact";
import type { EnrichedDeckListData } from "./schema";
import {
  Card,
  CardTitle,
  CardMetadata,
  ListPageHeader,
  EmptyState,
  formatDate,
} from "@brains/ui-library";

export const DeckListLayout = ({
  decks,
  pageTitle,
}: EnrichedDeckListData): JSX.Element => {
  return (
    <div className="deck-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <ListPageHeader
        title={pageTitle ?? "Presentation Decks"}
        count={decks.length}
        singularLabel="presentation"
        description="available"
      />

      <div className="space-y-6">
        {decks.map((deck) => (
          <Card key={deck.id} variant="vertical">
            <CardTitle href={deck.url} className="text-xl">
              {deck.title}
            </CardTitle>

            {deck.description && (
              <p className="text-theme-muted mb-4">{deck.description}</p>
            )}

            <CardMetadata>
              <div className="flex justify-between text-sm text-theme-muted">
                {deck.author && <span>By {deck.author}</span>}
                <time dateTime={deck.updated}>
                  Updated {formatDate(deck.updated)}
                </time>
              </div>
            </CardMetadata>
          </Card>
        ))}
      </div>

      {decks.length === 0 && (
        <EmptyState
          message="No presentation decks available yet."
          description="Add markdown files with slide separators (---) to the decks directory."
        />
      )}
    </div>
  );
};
