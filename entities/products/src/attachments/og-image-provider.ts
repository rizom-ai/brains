import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  renderOgImagePng,
  type ScreenshotPng,
} from "@brains/media-page-composer";
import { parseMarkdown, slugify } from "@brains/utils";
import type { Product } from "../schemas/product";
import { productFrontmatterSchema } from "../schemas/product";
import {
  PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
  productOgImageTemplate,
  type ProductOgImageTemplateData,
} from "./og-image-template";

export interface ProductOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class ProductOgImageAttachmentProvider implements AttachmentProvider {
  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    private readonly deps: ProductOgImageAttachmentProviderDeps = {},
  ) {}

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "product" ||
      request.attachmentType !== PRODUCT_OG_IMAGE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const product = await this.context.entityService.getEntity<Product>({
      entityType: "product",
      id: request.sourceEntityId,
    });
    if (!product) return undefined;

    const { frontmatter, content: body } = parseMarkdown(product.content);
    const parsed = productFrontmatterSchema.parse(frontmatter);
    const tagline = extractSection(body, "Tagline");
    const brandLabel = this.resolveBrandLabel();
    const content: ProductOgImageTemplateData = {
      name: parsed.name,
      availability: parsed.availability,
      ...(tagline ? { tagline } : {}),
      ...(brandLabel ? { brandLabel } : {}),
    };

    const png = await renderOgImagePng({
      mediaPath: `/_media/og/product/${product.id}`,
      template: productOgImageTemplate,
      content,
      title: content.name,
      themeMode: "light",
      themeCSS: this.context.themeCSS,
      tmpPrefix: "brain-product-og-image-",
      ...(this.deps.screenshotPng && {
        screenshotPng: this.deps.screenshotPng,
      }),
    });

    return {
      type: "image",
      data: png,
      mimeType: "image/png",
      filename: `${getProductSlug(product)}-og.png`,
    };
  }

  private resolveBrandLabel(): string | undefined {
    const domain = this.context.domain?.trim();
    if (domain && domain.length > 0) return domain;

    const name = this.context.identity.getProfile().name.trim();
    return name.length > 0 ? name : undefined;
  }
}

function extractSection(content: string, heading: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start === -1) return undefined;

  const sectionLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("## ")) break;
    sectionLines.push(line);
  }

  const value = sectionLines.join("\n").trim();
  return value.length > 0 ? value : undefined;
}

function getProductSlug(product: Product): string {
  const metadataSlug = product.metadata.slug;
  return metadataSlug.length > 0
    ? metadataSlug
    : slugify(product.metadata.name);
}
