import type { JSX } from "preact";
import type { SummaryDetailData } from "./schema";
import {
  EmptyState,
  BackLink,
  formatDate,
  DetailPageHeader,
  EntryCard,
} from "@brains/ui-library";

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
      <DetailPageHeader
        title={`${channelName} Summary`}
        titleSize="3xl"
        useSemanticHeader={false}
        metadata={
          <>
            <span>{entryCount} entries</span>
            <span>{totalMessages} messages</span>
            <time dateTime={updated}>Last updated {formatDate(updated)}</time>
          </>
        }
      />

      <div className="space-y-8">
        {entries.map((entry, index) => (
          <EntryCard
            key={`${entry.created}-${index}`}
            title={entry.title}
            created={entry.created}
            updated={entry.updated}
            content={entry.content}
          />
        ))}
      </div>

      {entries.length === 0 && (
        <EmptyState
          message="No summary entries available."
          description="This conversation hasn't been summarized yet."
        />
      )}

      <BackLink href="/summaries">Back to all summaries</BackLink>
    </div>
  );
};
