import type { JSX } from "preact";
import type { SummaryDetailData } from "./schema";

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
                <span>
                  Messages {entry.windowStart}-{entry.windowEnd}
                </span>
              </div>
            </header>

            <div className="prose prose-theme max-w-none mb-4">
              <p>{entry.content}</p>
            </div>

            {(entry.keyPoints ??
              entry.decisions ??
              entry.actionItems ??
              entry.participants) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {entry.keyPoints && entry.keyPoints.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Key Points</h3>
                    <ul className="list-disc list-inside text-sm text-theme-muted space-y-1">
                      {entry.keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.decisions && entry.decisions.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Decisions</h3>
                    <ul className="list-disc list-inside text-sm text-theme-muted space-y-1">
                      {entry.decisions.map((decision, i) => (
                        <li key={i}>{decision}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.actionItems && entry.actionItems.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Action Items</h3>
                    <ul className="list-disc list-inside text-sm text-theme-muted space-y-1">
                      {entry.actionItems.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.participants && entry.participants.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Participants</h3>
                    <div className="flex flex-wrap gap-2">
                      {entry.participants.map((participant) => (
                        <span
                          key={participant}
                          className="px-2 py-1 text-xs bg-theme rounded-full text-theme-muted"
                        >
                          {participant}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
