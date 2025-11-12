import type { JSX } from "preact";
import type { SummaryListData } from "./schema";
import {
  Card,
  CardTitle,
  CardMetadata,
  ListPageHeader,
  EmptyState,
  formatDate,
} from "@brains/ui-library";

export const SummaryListLayout = ({
  summaries,
  totalCount,
}: SummaryListData): JSX.Element => {
  return (
    <div className="summary-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <ListPageHeader
        title="Conversation Summaries"
        count={totalCount}
        singularLabel="conversation"
        description="have been summarized chronologically"
      />

      <div className="space-y-6">
        {summaries.map((summary) => (
          <Card key={summary.id} variant="vertical">
            <CardTitle href={`/summaries/${summary.id}`} className="text-xl">
              {summary.channelName}
            </CardTitle>

            <p className="text-theme-muted mb-4">
              Latest: {summary.latestEntry}
            </p>

            <CardMetadata className="mb-3">
              <div className="flex items-center gap-4 text-sm text-theme-muted">
                <span className="px-2 py-1 bg-theme rounded-full">
                  {summary.entryCount} entries
                </span>
                <span className="px-2 py-1 bg-theme rounded-full">
                  {summary.totalMessages} messages
                </span>
              </div>
            </CardMetadata>

            <CardMetadata>
              <div className="flex justify-between text-sm text-theme-muted">
                <time dateTime={summary.created}>
                  Created {formatDate(summary.created)}
                </time>
                <time dateTime={summary.updated}>
                  Updated {formatDate(summary.updated)}
                </time>
              </div>
            </CardMetadata>
          </Card>
        ))}
      </div>

      {summaries.length === 0 && (
        <EmptyState
          message="No summaries available yet."
          description="Summaries will appear here as conversations are processed."
        />
      )}
    </div>
  );
};
