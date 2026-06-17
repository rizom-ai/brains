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
import { parseMarkdown, slugify } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import {
  BLOG_PRINTABLE_ATTACHMENT_TYPE,
  blogPrintableTemplate,
  type BlogPrintableTemplateData,
} from "./printable-template";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface BlogPrintableAttachmentProviderDeps {
  renderPdf?: RenderPdf;
}

export class BlogPrintableAttachmentProvider implements AttachmentProvider {
  private readonly context: Pick<
    EntityPluginContext,
    "entityService" | "themeCSS" | "identity" | "domain"
  >;
  private readonly renderPdf: RenderPdf;

  constructor(
    context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: BlogPrintableAttachmentProviderDeps = {},
  ) {
    this.context = context;
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "post" ||
      request.attachmentType !== BLOG_PRINTABLE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const post = await this.context.entityService.getEntity<BlogPost>({
      entityType: "post",
      id: request.sourceEntityId,
    });
    if (!post) return undefined;

    const printableContent = buildPrintableContent(post, {
      brandLabel: this.resolveBrandLabel(),
      coverImageUrl: await this.resolveCoverImageUrl(post),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-blog-printable-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/printable/post/${post.id}`,
        template: blogPrintableTemplate,
        format: "pdf",
        content: printableContent,
        siteConfig: { title: printableContent.title, themeMode: "light" },
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
          filename: `${getPostSlug(post)}-printable.pdf`,
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

  private async resolveCoverImageUrl(
    post: BlogPost,
  ): Promise<string | undefined> {
    const { frontmatter } = parseMarkdown(post.content);
    const parsed = blogPostFrontmatterSchema.parse(frontmatter);
    if (!parsed.coverImageId) return undefined;

    const image = await this.context.entityService.getEntity({
      entityType: "image",
      id: parsed.coverImageId,
    });
    return image?.content.startsWith("data:image/") ? image.content : undefined;
  }
}

function buildPrintableContent(
  post: BlogPost,
  options: {
    brandLabel?: string | undefined;
    coverImageUrl?: string | undefined;
  } = {},
): BlogPrintableTemplateData {
  const { frontmatter, content } = parseMarkdown(post.content);
  const parsed = blogPostFrontmatterSchema.parse(frontmatter);
  return {
    title: parsed.title,
    body: content,
    ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
    ...(parsed.author ? { author: parsed.author } : {}),
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
    ...(parsed.canonicalUrl ? { canonicalUrl: parsed.canonicalUrl } : {}),
    ...(options.coverImageUrl ? { coverImageUrl: options.coverImageUrl } : {}),
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
}

function getPostSlug(post: BlogPost): string {
  const metadataSlug = post.metadata.slug;
  return metadataSlug.length > 0 ? metadataSlug : slugify(post.metadata.title);
}
