import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import { screenshotPng as defaultScreenshotPng } from "@brains/media-renderer";
import type {
  ScreenshotPngOptions,
  ViewportOptions,
} from "@brains/media-renderer";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "@brains/media-page-composer";
import { parseMarkdown, slugify } from "@brains/utils";
import type { Product } from "../schemas/product";
import { productFrontmatterSchema } from "../schemas/product";
import {
  PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
  productOgImageTemplate,
  type ProductOgImageTemplateData,
} from "./og-image-template";

const OG_VIEWPORT: ViewportOptions = { width: 1200, height: 630 };
const DEFAULT_TIMEOUT_MS = 60_000;

export type ScreenshotPng = (
  url: string,
  viewport: ViewportOptions,
  options?: ScreenshotPngOptions,
) => Promise<Buffer>;

export interface ProductOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class ProductOgImageAttachmentProvider implements AttachmentProvider {
  private readonly screenshotPng: ScreenshotPng;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: ProductOgImageAttachmentProviderDeps = {},
  ) {
    this.screenshotPng = deps.screenshotPng ?? defaultScreenshotPng;
  }

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

    const ogContent = buildOgImageContent(product, {
      brandLabel: this.resolveBrandLabel(),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-product-og-image-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/og/product/${product.id}`,
        template: productOgImageTemplate,
        format: "image",
        content: ogContent,
        siteConfig: { title: ogContent.name, themeMode: "light" },
        themeCSS: this.context.themeCSS,
      });

      const server = await startStaticRenderServer({ rootDir: outputDir });
      try {
        const png = await this.screenshotPng(
          server.urlFor(page.urlPath),
          OG_VIEWPORT,
          {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            fullPage: false,
            omitBackground: false,
          },
        );

        return {
          type: "image",
          data: png,
          mimeType: "image/png",
          filename: `${getProductSlug(product)}-og.png`,
        };
      } finally {
        await server.close();
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }

  private resolveBrandLabel(): string | undefined {
    const domain = this.context.domain?.trim();
    if (domain && domain.length > 0) return domain;

    const name = this.context.identity.getProfile().name.trim();
    return name.length > 0 ? name : undefined;
  }
}

function buildOgImageContent(
  product: Product,
  options: { brandLabel?: string | undefined } = {},
): ProductOgImageTemplateData {
  const { frontmatter, content } = parseMarkdown(product.content);
  const parsed = productFrontmatterSchema.parse(frontmatter);
  const tagline = extractSection(content, "Tagline");
  return {
    name: parsed.name,
    availability: parsed.availability,
    ...(tagline ? { tagline } : {}),
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
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
