import type { JSX } from "preact";
import type { SummaryDetailData } from "./schema";
import { EmptyState, formatDate } from "@brains/ui-library";

/**
 * Layout that renders structured entries
 * Each entry has simple 4-field structure with natural prose content
 */
export const SummaryDetailLayout = ({
  channelName,
  entries,
  totalMessages,
  updated,
  entryCount,
}: SummaryDetailData): JSX.Element => {
  return (
    <div className="summary-detail-container max-w-4xl mx-auto p-6 bg-theme">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme">
          {channelName} Summary
        </h1>
        <div className="flex items-center gap-4 text-theme-muted">
          <span>{entryCount} entries</span>
          <span>{totalMessages} messages</span>
          <time dateTime={updated}>Last updated {formatDate(updated)}</time>
        </div>
      </div>

      <div className="space-y-8">
        {entries.map((entry, index) => (
          <article
            key={`${entry.created}-${index}`}
            className="entry-card bg-theme-subtle rounded-lg p-6 border border-theme"
          >
            <header className="mb-4">
              <h2 className="text-xl font-semibold mb-2 text-theme">
                {entry.title}
              </h2>
              <div className="flex items-center gap-4 text-sm text-theme-muted">
                <time dateTime={entry.created}>
                  Created {formatDate(entry.created)}
                </time>
                {entry.updated !== entry.created && (
                  <time dateTime={entry.updated}>
                    Updated {formatDate(entry.updated)}
                  </time>
                )}
              </div>
            </header>

            <div className="prose prose-theme max-w-none">
              {entry.content.split("\n").map((paragraph, pIndex) =>
                paragraph.trim() ? (
                  <p key={pIndex} className="mb-4 text-theme-muted">
                    {paragraph}
                  </p>
                ) : null,
              )}
            </div>
          </article>
        ))}
      </div>

      {entries.length === 0 && (
        <EmptyState
          message="No summary entries available."
          description="This conversation hasn't been summarized yet."
        />
      )}

      <div className="mt-8 pt-6 border-t border-theme">
        <a
          href="/summaries"
          className="text-brand hover:text-brand-dark text-sm"
        >
          ← Back to all summaries
        </a>
      </div>
    </div>
  );
};
