import type { JSX } from "preact";
import { z } from "@brains/utils";
import { OgCard } from "@brains/ui-library";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PRODUCT_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const PRODUCT_OG_IMAGE_TEMPLATE_NAME = "products:og-image";

export const productOgImageTemplateSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional(),
  availability: z.string().optional(),
  brandLabel: z.string().optional(),
});

export type ProductOgImageTemplateData = z.infer<
  typeof productOgImageTemplateSchema
>;

export const productOgImageTemplate: MediaPageTemplate = {
  name: PRODUCT_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "products",
  schema: productOgImageTemplateSchema,
  renderers: {
    image: renderProductOgImage,
  },
};

function renderProductOgImage(props: Record<string, unknown>): JSX.Element {
  const data = productOgImageTemplateSchema.parse(props);

  return (
    <OgCard
      cover
      brandLabel={data.brandLabel ?? data.name}
      eyebrow="Product"
      title={data.name}
      subtitle={data.tagline}
      tag={data.availability}
    />
  );
}
