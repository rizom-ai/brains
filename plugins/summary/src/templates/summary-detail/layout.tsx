import type { JSX } from "preact";
import type { SummaryDetailData } from "./schema";

/**
 * Layout that renders structured entries
 * Each entry has simple 4-field structure with natural prose content
 */
export const SummaryDetailLayout = ({
  conversationId,
  entries,
  totalMessages,
  lastUpdated,
  entryCount,
}: SummaryDetailData): JSX.Element => {
  return (
    <div className="summary-detail-container max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Conversation Summary: {conversationId}
        </h1>
        <div className="flex items-center gap-4 text-theme-muted">
          <span>{entryCount} entries</span>
          <span>{totalMessages} messages</span>
          <time dateTime={lastUpdated}>
            Last updated {new Date(lastUpdated).toLocaleDateString()}
          </time>
        </div>
      </div>

      <div className="space-y-8">
        {entries.map((entry, index) => (
          <article
            key={`${entry.created}-${index}`}
            className="entry-card bg-theme-subtle rounded-lg p-6"
          >
            <header className="mb-4">
              <h2 className="text-xl font-semibold mb-2">{entry.title}</h2>
              <div className="flex items-center gap-4 text-sm text-theme-muted">
                <time dateTime={entry.created}>
                  Created {new Date(entry.created).toLocaleDateString()}
                </time>
                {entry.updated !== entry.created && (
                  <time dateTime={entry.updated}>
                    Updated {new Date(entry.updated).toLocaleDateString()}
                  </time>
                )}
              </div>
            </header>

            <div className="prose prose-theme max-w-none">
              <p>{entry.content}</p>
            </div>
          </article>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-muted">No summary entries available.</p>
          <p className="text-sm text-theme-muted mt-2">
            This conversation hasn't been summarized yet.
          </p>
        </div>
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