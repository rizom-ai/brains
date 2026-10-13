import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { OgCard } from "@brains/ui-library";
import { createTemplate, type Template } from "@brains/plugins";

export const PROJECT_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const PROJECT_OG_IMAGE_TEMPLATE_NAME = "portfolio:og-image";

export const projectOgImageTemplateSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  year: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  brandLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  year: z.number().nullable().default(null),
  brandLabel: z.string().nullable().default(null),
  coverImageUrl: z.string().nullable().default(null),
});

export type ProjectOgImageTemplateData = z.output<
  typeof projectOgImageTemplateSchema
>;

/** What a provider builds; absent fields render as null. */
export type ProjectOgImageTemplateInput = z.input<
  typeof projectOgImageTemplateSchema
>;

export const projectOgImageTemplate: Template =
  createTemplate<ProjectOgImageTemplateData>({
    name: "og-image",
    description: "Open Graph image for a project",
    schema: projectOgImageTemplateSchema,
    requiredPermission: "public",
    layout: { formats: { image: renderProjectOgImage } },
  });

function renderProjectOgImage(data: ProjectOgImageTemplateData): JSX.Element {
  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Project"
      title={data.title}
      subtitle={data.description ?? undefined}
      tag={data.year ?? undefined}
    />
  );
}
