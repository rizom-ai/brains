import type { JSX } from "preact";
import type { TopicDetailData } from "./schema";

export const TopicDetailLayout = ({
  title,
  summary,
  content,
  keywords,
  sources,
  created,
  updated,
}: TopicDetailData): JSX.Element => {
  return (
    <article className="topic-detail-container max-w-4xl mx-auto p-6 bg-theme">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4 text-theme">{title}</h1>

        <div className="text-sm text-theme-muted mb-4">
          <time dateTime={created}>
            Created {new Date(created).toLocaleDateString()}
          </time>
          {" • "}
          <time dateTime={updated}>
            Updated {new Date(updated).toLocaleDateString()}
          </time>
        </div>

        <p className="text-lg text-theme-muted italic">{summary}</p>
      </header>

      <div className="prose prose-lg max-w-none mb-8 text-theme-muted">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      {keywords.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-theme">Keywords</h2>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="px-3 py-1 bg-theme-muted rounded-full text-sm text-theme"
              >
                {keyword}
              </span>
            ))}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-theme">Sources</h2>
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="p-4 bg-theme-subtle rounded-lg hover:bg-theme-muted transition-colors border border-theme"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-theme">{source.title}</h3>
                    <p className="text-sm text-theme-muted mt-1">
                      Type: {source.type} • ID: {source.id}
                    </p>
                    {source.excerpt && (
                      <p className="text-sm mt-2 text-theme-muted italic">
                        {source.excerpt}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="mt-8 pt-8 border-t">
        <a href="/topics" className="text-brand hover:text-brand-dark">
          ← Back to Topics
        </a>
      </nav>
    </article>
  );
};
