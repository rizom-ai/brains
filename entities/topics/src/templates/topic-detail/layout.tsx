import type { JSX } from "preact";
import type { TopicDetailData } from "./schema";
import { BackLink, DetailPageHeader } from "@brains/ui-library";

export const TopicDetailLayout = ({
  title,
  content,
  created,
  updated,
}: TopicDetailData): JSX.Element => {
  return (
    <article className="topic-detail-container max-w-4xl mx-auto p-6 bg-theme">
      <DetailPageHeader title={title} created={created} updated={updated} />

      <div className="prose prose-lg max-w-none mb-8 text-theme-muted">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>

      <BackLink href="/topics">Back to Topics</BackLink>
    </article>
  );
};
