import type { JSX } from "preact";
import type { TopicDetailData } from "./schema";
import {
  TagsList,
  BackLink,
  DetailPageHeader,
  SourceReferenceCard,
} from "@brains/ui-library";

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
      <DetailPageHeader
        title={title}
        created={created}
        updated={updated}
        summary={summary}
      />

      <div className="prose prose-lg max-w-none mb-8 text-theme-muted">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      {keywords.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-theme">Keywords</h2>
          <TagsList tags={keywords} maxVisible={keywords.length} size="sm" />
        </section>
      )}

      {sources.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-theme">Sources</h2>
          <div className="space-y-3">
            {sources.map((source) => (
              <SourceReferenceCard
                key={source.id}
                id={source.id}
                title={source.title}
                type={source.type}
                {...(source.excerpt && { excerpt: source.excerpt })}
                href={`/summaries/${source.id}`}
              />
            ))}
          </div>
        </section>
      )}

      <BackLink href="/topics">Back to Topics</BackLink>
    </article>
  );
};
