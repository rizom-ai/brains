import type { JSX } from "preact";
import { z } from "@brains/utils/zod-v4";
import { OgCard } from "@brains/ui-library";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PROJECT_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const PROJECT_OG_IMAGE_TEMPLATE_NAME = "portfolio:og-image";

export const projectOgImageTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  year: z.number().optional(),
  brandLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type ProjectOgImageTemplateData = z.output<
  typeof projectOgImageTemplateSchema
>;

export const projectOgImageTemplate: MediaPageTemplate = {
  name: PROJECT_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "portfolio",
  schema: projectOgImageTemplateSchema,
  renderers: {
    image: renderProjectOgImage,
  },
};

function renderProjectOgImage(props: Record<string, unknown>): JSX.Element {
  const data = projectOgImageTemplateSchema.parse(props);

  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Project"
      title={data.title}
      subtitle={data.description}
      tag={data.year}
    />
  );
}
