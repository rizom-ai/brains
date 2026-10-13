import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { OgCard, formatDate as formatDateStyled } from "@brains/ui-library";
import { createTemplate, type Template } from "@brains/plugins";

export const BLOG_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const BLOG_OG_IMAGE_TEMPLATE_NAME = "blog:og-image";

export const blogOgImageTemplateSchema: z.ZodObject<{
  title: z.ZodString;
  excerpt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  author: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  brandLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string().min(1),
  excerpt: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  brandLabel: z.string().nullable().default(null),
  coverImageUrl: z.string().nullable().default(null),
});

export type BlogOgImageTemplateData = z.output<
  typeof blogOgImageTemplateSchema
>;

/** What a provider builds; absent fields render as null. */
export type BlogOgImageTemplateInput = z.input<
  typeof blogOgImageTemplateSchema
>;

export const blogOgImageTemplate: Template =
  createTemplate<BlogOgImageTemplateData>({
    name: "og-image",
    description: "Open Graph image for a blog post",
    schema: blogOgImageTemplateSchema,
    requiredPermission: "public",
    layout: { formats: { image: renderBlogOgImage } },
  });

function formatDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return formatDateStyled(date, { style: "medium" });
}

function renderBlogOgImage(data: BlogOgImageTemplateData): JSX.Element {
  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Journal"
      title={data.title}
      subtitle={data.excerpt ?? undefined}
      meta={[data.author ?? undefined]}
      tag={formatDate(data.publishedAt)}
    />
  );
}
