import type { JSX } from "preact";
import type { SummaryListData } from "./schema";

export const SummaryListLayout = ({
  summaries,
  totalCount,
}: SummaryListData): JSX.Element => {
  return (
    <div className="summary-list-container max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Conversation Summaries</h1>
        <p className="text-theme-muted">
          {totalCount} conversations have been summarized chronologically
        </p>
      </div>

      <div className="space-y-6">
        {summaries.map((summary) => (
          <article
            key={summary.id}
            className="summary-card bg-theme-subtle rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">
              <a
                href={`/summaries/${summary.conversationId}`}
                className="text-brand hover:text-brand-dark"
              >
                Conversation {summary.conversationId}
              </a>
            </h2>

            <p className="text-theme-muted mb-4">
              Latest: {summary.latestEntry}
            </p>

            <div className="flex items-center gap-4 mb-3 text-sm text-theme-muted">
              <span className="px-2 py-1 bg-theme rounded-full">
                {summary.entryCount} entries
              </span>
              <span className="px-2 py-1 bg-theme rounded-full">
                {summary.totalMessages} messages
              </span>
            </div>

            <div className="flex justify-between text-sm text-theme-muted">
              <time dateTime={summary.created}>
                Created {new Date(summary.created).toLocaleDateString()}
              </time>
              <time dateTime={summary.lastUpdated}>
                Updated {new Date(summary.lastUpdated).toLocaleDateString()}
              </time>
            </div>
          </article>
        ))}
      </div>

      {summaries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-muted">No summaries available yet.</p>
          <p className="text-sm text-theme-muted mt-2">
            Summaries will appear here as conversations are processed.
          </p>
        </div>
      )}
    </div>
  );
};
