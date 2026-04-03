import type { JSX } from "preact";
import type { TopicDetailData } from "./schema";
import { TagsList, BackLink, DetailPageHeader } from "@brains/ui-library";

export const TopicDetailLayout = ({
  title,
  content,
  keywords,
  created,
  updated,
}: TopicDetailData): JSX.Element => {
  return (
    <article className="topic-detail-container max-w-4xl mx-auto p-6 bg-theme">
      <DetailPageHeader title={title} created={created} updated={updated} />

      <div className="prose prose-lg max-w-none mb-8 text-theme-muted">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      {keywords.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-theme">Keywords</h2>
          <TagsList tags={keywords} maxVisible={keywords.length} size="sm" />
        </section>
      )}

      <BackLink href="/topics">Back to Topics</BackLink>
    </article>
  );
};
