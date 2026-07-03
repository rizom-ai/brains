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
import { parseMarkdown } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import {
  BLOG_OG_IMAGE_ATTACHMENT_TYPE,
  blogOgImageTemplate,
  type BlogOgImageTemplateData,
} from "./og-image-template";

const OG_VIEWPORT: ViewportOptions = { width: 1200, height: 630 };
const DEFAULT_TIMEOUT_MS = 60_000;

export type ScreenshotPng = (
  url: string,
  viewport: ViewportOptions,
  options?: ScreenshotPngOptions,
) => Promise<Buffer>;

export interface BlogOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class BlogOgImageAttachmentProvider implements AttachmentProvider {
  readonly metadata = {
    outputEntityType: "image",
    targetField: "ogImageId",
  } as const;

  private readonly screenshotPng: ScreenshotPng;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: BlogOgImageAttachmentProviderDeps = {},
  ) {
    this.screenshotPng = deps.screenshotPng ?? defaultScreenshotPng;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "post" ||
      request.attachmentType !== BLOG_OG_IMAGE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const post = await this.context.entityService.getEntity<BlogPost>({
      entityType: "post",
      id: request.sourceEntityId,
    });
    if (!post) return undefined;

    const ogContent = buildOgImageContent(post, {
      brandLabel: this.resolveBrandLabel(),
      coverImageUrl: await this.resolveCoverImageUrl(post),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-blog-og-image-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/og/post/${post.id}`,
        template: blogOgImageTemplate,
        format: "image",
        content: ogContent,
        siteConfig: { title: ogContent.title, themeMode: "light" },
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
          filename: `${getPostSlug(post)}-og.png`,
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

function buildOgImageContent(
  post: BlogPost,
  options: {
    brandLabel?: string | undefined;
    coverImageUrl?: string | undefined;
  } = {},
): BlogOgImageTemplateData {
  const { frontmatter } = parseMarkdown(post.content);
  const parsed = blogPostFrontmatterSchema.parse(frontmatter);
  return {
    title: parsed.title,
    ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
    ...(parsed.author ? { author: parsed.author } : {}),
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
    ...(options.coverImageUrl ? { coverImageUrl: options.coverImageUrl } : {}),
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
}

function getPostSlug(post: BlogPost): string {
  const metadataSlug = post.metadata.slug;
  return metadataSlug.length > 0 ? metadataSlug : slugify(post.metadata.title);
}
