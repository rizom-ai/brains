import type { JSX } from "preact";
import type { SummaryDetailData } from "./schema";
import {
  EmptyState,
  BackLink,
  formatDate,
  DetailPageHeader,
  Card,
  CardMetadata,
  CardTitle,
} from "@brains/ui-library";

const ListSection = ({
  title,
  items,
}: {
  title: string;
  items: string[];
}): JSX.Element | null => {
  if (items.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className="list-disc pl-6 space-y-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
};

export const SummaryDetailLayout = ({
  channelName,
  entries,
  messageCount,
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
            <span>{messageCount} messages</span>
            <time dateTime={updated}>Last updated {formatDate(updated)}</time>
          </>
        }
      />

      <div className="space-y-8">
        {entries.map((entry, index) => (
          <Card key={`${entry.timeRange.start}-${index}`} variant="vertical">
            <CardTitle className="text-xl">{entry.title}</CardTitle>
            <CardMetadata className="mb-4">
              <time dateTime={entry.timeRange.start}>
                {formatDate(entry.timeRange.start)}
              </time>{" "}
              <span>→</span>{" "}
              <time dateTime={entry.timeRange.end}>
                {formatDate(entry.timeRange.end)}
              </time>{" "}
              <span>· {entry.sourceMessageCount} messages</span>
            </CardMetadata>
            <p className="text-theme leading-relaxed">{entry.summary}</p>
            <ListSection title="Key Points" items={entry.keyPoints} />
            <ListSection title="Decisions" items={entry.decisions} />
            <ListSection title="Action Items" items={entry.actionItems} />
          </Card>
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
