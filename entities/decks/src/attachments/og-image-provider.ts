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
import type { DeckEntity } from "../schemas/deck";
import { deckFrontmatterSchema } from "../schemas/deck";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  deckOgImageTemplate,
  type DeckOgImageTemplateData,
} from "./og-image-template";

const OG_VIEWPORT: ViewportOptions = { width: 1200, height: 630 };
const DEFAULT_TIMEOUT_MS = 60_000;

export type ScreenshotPng = (
  url: string,
  viewport: ViewportOptions,
  options?: ScreenshotPngOptions,
) => Promise<Buffer>;

export interface DeckOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class DeckOgImageAttachmentProvider implements AttachmentProvider {
  private readonly screenshotPng: ScreenshotPng;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: DeckOgImageAttachmentProviderDeps = {},
  ) {
    this.screenshotPng = deps.screenshotPng ?? defaultScreenshotPng;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "deck" ||
      request.attachmentType !== DECK_OG_IMAGE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const deck = await this.context.entityService.getEntity<DeckEntity>({
      entityType: "deck",
      id: request.sourceEntityId,
    });
    if (!deck) return undefined;

    const ogContent = buildOgImageContent(deck, {
      brandLabel: this.resolveBrandLabel(),
      coverImageUrl: await this.resolveCoverImageUrl(deck),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-deck-og-image-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/og/deck/${deck.id}`,
        template: deckOgImageTemplate,
        format: "image",
        content: ogContent,
        siteConfig: { title: ogContent.title, themeMode: "dark" },
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
          filename: `${getDeckSlug(deck)}-og.png`,
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
    deck: DeckEntity,
  ): Promise<string | undefined> {
    const { frontmatter } = parseMarkdown(deck.content);
    const parsed = deckFrontmatterSchema.parse(frontmatter);
    if (!parsed.coverImageId) return undefined;

    const image = await this.context.entityService.getEntity({
      entityType: "image",
      id: parsed.coverImageId,
    });
    return image?.content.startsWith("data:image/") ? image.content : undefined;
  }
}

function buildOgImageContent(
  deck: DeckEntity,
  options: {
    brandLabel?: string | undefined;
    coverImageUrl?: string | undefined;
  } = {},
): DeckOgImageTemplateData {
  const { frontmatter, content } = parseMarkdown(deck.content);
  const parsed = deckFrontmatterSchema.parse(frontmatter);
  const slideCount = countSlides(content);
  return {
    title: parsed.title,
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.event ? { event: parsed.event } : {}),
    ...(slideCount ? { slideCount } : {}),
    ...(options.coverImageUrl ? { coverImageUrl: options.coverImageUrl } : {}),
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
}

function countSlides(content: string): number {
  return content
    .split(/^---$/gm)
    .map((slide) => slide.trim())
    .filter((slide) => slide.length > 0).length;
}

function getDeckSlug(deck: DeckEntity): string {
  const metadataSlug = deck.metadata.slug;
  return metadataSlug.length > 0 ? metadataSlug : slugify(deck.metadata.title);
}
