import type { JSX } from "preact";
import type { TopicListData } from "./schema";

export const TopicListLayout = ({
  topics,
  totalCount,
}: TopicListData): JSX.Element => {
  return (
    <div className="topic-list-container max-w-4xl mx-auto p-6 bg-theme">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme">Topics</h1>
        <p className="text-theme-muted">
          Discovered {totalCount} topics from your knowledge base
        </p>
      </div>

      <div className="space-y-6">
        {topics.map((topic) => (
          <article
            key={topic.id}
            className="topic-card bg-theme-subtle rounded-lg p-6 hover:shadow-lg transition-shadow border border-theme"
          >
            <h2 className="text-xl font-semibold mb-2">
              <a
                href={`/topics/${topic.id}`}
                className="text-brand hover:text-brand-dark"
              >
                {topic.title}
              </a>
            </h2>

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

            <div className="flex justify-between text-sm text-theme-muted">
              <span>{topic.sourceCount} sources</span>
              <time dateTime={topic.updated}>
                Updated {new Date(topic.updated).toLocaleDateString()}
              </time>
            </div>
          </article>
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
