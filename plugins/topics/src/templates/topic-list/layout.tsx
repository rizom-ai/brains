import type { JSX } from "preact";
import type { TopicListData } from "./schema";
import { Card, CardTitle, CardMetadata } from "@brains/ui-library";

export const TopicListLayout = ({
  topics,
  totalCount,
}: TopicListData): JSX.Element => {
  return (
    <div className="topic-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme">Topics</h1>
        <p className="text-theme-muted">
          Discovered {totalCount} topics from your knowledge base
        </p>
      </div>

      <div className="space-y-6">
        {topics.map((topic) => (
          <Card key={topic.id} variant="vertical">
            <CardTitle href={`/topics/${topic.id}`} className="text-xl">
              {topic.title}
            </CardTitle>

            <p className="text-theme-muted mb-4">{topic.summary}</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {topic.keywords.slice(0, 5).map((keyword) => (
                <span
                  key={keyword}
                  className="px-2 py-1 text-xs bg-theme rounded-full text-theme-muted"
                >
                  {keyword}
                </span>
              ))}
            </div>

            <CardMetadata>
              <div className="flex justify-between text-sm text-theme-muted">
                <span>{topic.sourceCount} sources</span>
                <time dateTime={topic.updated}>
                  Updated {new Date(topic.updated).toLocaleDateString()}
                </time>
              </div>
            </CardMetadata>
          </Card>
        ))}
      </div>

      {topics.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-muted">No topics discovered yet.</p>
          <p className="text-sm text-theme-muted mt-2">
            Topics will appear here as they are extracted from your content.
          </p>
        </div>
      )}
    </div>
  );
};
