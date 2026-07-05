import type { JSX } from "preact";
import { z } from "@brains/utils/zod-v4";
import { OgCard } from "@brains/ui-library";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const BLOG_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const BLOG_OG_IMAGE_TEMPLATE_NAME = "blog:og-image";

export interface BlogOgImageTemplateData {
  title: string;
  excerpt?: string | undefined;
  author?: string | undefined;
  publishedAt?: string | undefined;
  brandLabel?: string | undefined;
  coverImageUrl?: string | undefined;
}

export const blogOgImageTemplateSchema: z.ZodType<BlogOgImageTemplateData> =
  z.object({
    title: z.string().min(1),
    excerpt: z.string().optional(),
    author: z.string().optional(),
    publishedAt: z.string().optional(),
    brandLabel: z.string().optional(),
    coverImageUrl: z.string().optional(),
  });

export const blogOgImageTemplate: MediaPageTemplate = {
  name: BLOG_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "blog",
  schema: blogOgImageTemplateSchema,
  renderers: {
    image: renderBlogOgImage,
  },
};

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function renderBlogOgImage(props: Record<string, unknown>): JSX.Element {
  const data = blogOgImageTemplateSchema.parse(props);

  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Journal"
      title={data.title}
      subtitle={data.excerpt}
      meta={[data.author]}
      tag={formatDate(data.publishedAt)}
    />
  );
}
