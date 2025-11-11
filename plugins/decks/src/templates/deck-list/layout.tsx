import type { JSX } from "preact";
import type { DeckListData } from "./schema";
import { Card, CardTitle, CardMetadata } from "@brains/ui-library";

export const DeckListLayout = ({ decks }: DeckListData): JSX.Element => {
  return (
    <div className="deck-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme">
          Presentation Decks
        </h1>
        <p className="text-theme-muted">
          {decks.length} {decks.length === 1 ? "presentation" : "presentations"}{" "}
          available
        </p>
      </div>

      <div className="space-y-6">
        {decks.map((deck) => (
          <Card key={deck.id} variant="vertical">
            <CardTitle href={`/decks/${deck.id}`} className="text-xl">
              {deck.title}
            </CardTitle>

            {deck.description && (
              <p className="text-theme-muted mb-4">{deck.description}</p>
            )}

            <CardMetadata>
              <div className="flex justify-between text-sm text-theme-muted">
                {deck.author && <span>By {deck.author}</span>}
                <time dateTime={deck.updated}>
                  Updated {new Date(deck.updated).toLocaleDateString()}
                </time>
              </div>
            </CardMetadata>
          </Card>
        ))}
      </div>

      {decks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-muted">
            No presentation decks available yet.
          </p>
          <p className="text-sm text-theme-muted mt-2">
            Add markdown files with slide separators (---) to the decks
            directory.
          </p>
        </div>
      )}
    </div>
  );
};
