import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import { renderPdf as defaultRenderPdf } from "@brains/media-renderer";
import type { PdfRenderOptions } from "@brains/media-renderer";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";
import type { Product } from "../schemas/product";
import { productFrontmatterSchema } from "../schemas/product";
import {
  PRODUCT_PRINTABLE_ATTACHMENT_TYPE,
  productPrintableTemplate,
  type ProductPrintableTemplateData,
} from "./printable-template";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface ProductPrintableAttachmentProviderDeps {
  renderPdf?: RenderPdf;
}

export class ProductPrintableAttachmentProvider implements AttachmentProvider {
  readonly metadata = { outputEntityType: "document" } as const;

  private readonly renderPdf: RenderPdf;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: ProductPrintableAttachmentProviderDeps = {},
  ) {
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "product" ||
      request.attachmentType !== PRODUCT_PRINTABLE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const product = await this.context.entityService.getEntity<Product>({
      entityType: "product",
      id: request.sourceEntityId,
    });
    if (!product) return undefined;

    const printableContent = buildPrintableContent(product, {
      brandLabel: this.resolveBrandLabel(),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-product-printable-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/printable/product/${product.id}`,
        template: productPrintableTemplate,
        format: "pdf",
        content: printableContent,
        siteConfig: { title: printableContent.name, themeMode: "light" },
        themeCSS: this.context.themeCSS,
      });

      const server = await startStaticRenderServer({ rootDir: outputDir });
      try {
        const pdf = await this.renderPdf(server.urlFor(page.urlPath), {
          maxBytes: DEFAULT_MAX_BYTES,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          printBackground: true,
          preferCSSPageSize: true,
        });

        return {
          type: "document",
          data: pdf,
          mimeType: "application/pdf",
          filename: `${getProductSlug(product)}-printable.pdf`,
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

function buildPrintableContent(
  product: Product,
  options: { brandLabel?: string | undefined } = {},
): ProductPrintableTemplateData {
  const { frontmatter, content } = parseMarkdown(product.content);
  const parsed = productFrontmatterSchema.parse(frontmatter);
  return {
    name: parsed.name,
    body: content,
    availability: parsed.availability,
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
}

function getProductSlug(product: Product): string {
  const metadataSlug = product.metadata.slug;
  return metadataSlug.length > 0
    ? metadataSlug
    : slugify(product.metadata.name);
}
