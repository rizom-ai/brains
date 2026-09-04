import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { OgCard, formatDate as formatDateStyled } from "@brains/ui-library";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const BLOG_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const BLOG_OG_IMAGE_TEMPLATE_NAME = "blog:og-image";

export const blogOgImageTemplateSchema: z.ZodObject<{
  title: z.ZodString;
  excerpt: z.ZodOptional<z.ZodString>;
  author: z.ZodOptional<z.ZodString>;
  publishedAt: z.ZodOptional<z.ZodString>;
  brandLabel: z.ZodOptional<z.ZodString>;
  coverImageUrl: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string().min(1),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  brandLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type BlogOgImageTemplateData = z.output<
  typeof blogOgImageTemplateSchema
>;

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
  return formatDateStyled(date, { style: "medium" });
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
