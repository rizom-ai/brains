import type { JSX } from "preact";
import type { TopicListData } from "./schema";
import {
  Card,
  CardTitle,
  CardMetadata,
  ListPageHeader,
  EmptyState,
  TagsList,
  formatDate,
} from "@brains/ui-library";

export const TopicListLayout = ({
  topics,
  totalCount,
}: TopicListData): JSX.Element => {
  return (
    <div className="topic-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <ListPageHeader
        title="Topics"
        count={totalCount}
        singularLabel="topic"
        description="discovered from your knowledge base"
      />

      <div className="space-y-6">
        {topics.map((topic) => (
          <Card key={topic.id} variant="vertical">
            <CardTitle href={`/topics/${topic.id}`} className="text-xl">
              {topic.title}
            </CardTitle>

            <p className="text-theme-muted mb-4">{topic.summary}</p>

            <TagsList
              tags={topic.keywords}
              maxVisible={5}
              variant="muted"
              className="mb-3"
            />

            <CardMetadata>
              <div className="flex justify-between text-sm text-theme-muted">
                <span>{topic.sourceCount} sources</span>
                <time dateTime={topic.updated}>
                  Updated {formatDate(topic.updated)}
                </time>
              </div>
            </CardMetadata>
          </Card>
        ))}
      </div>

      {topics.length === 0 && (
        <EmptyState
          message="No topics discovered yet."
          description="Topics will appear here as they are extracted from your content."
        />
      )}
    </div>
  );
};
