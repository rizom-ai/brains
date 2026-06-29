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
import type { DeckEntity } from "../schemas/deck";
import {
  deckCarouselTemplate,
  type DeckCarouselTemplateData,
} from "./carousel-template";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_SLIDES = 20;

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export type GetThemeMode = () => Promise<"light" | "dark">;

export interface DeckCarouselAttachmentProviderDeps {
  renderPdf?: RenderPdf;
  getThemeMode?: GetThemeMode;
}

export class DeckCarouselAttachmentProvider implements AttachmentProvider {
  readonly metadata = { outputEntityType: "document" } as const;

  private readonly renderPdf: RenderPdf;
  private readonly getThemeMode: GetThemeMode;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: DeckCarouselAttachmentProviderDeps = {},
  ) {
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
    this.getThemeMode =
      deps.getThemeMode ?? (async (): Promise<"light" | "dark"> => "dark");
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (request.sourceEntityType !== "deck") {
      return undefined;
    }

    const deck = await this.context.entityService.getEntity<DeckEntity>({
      entityType: "deck",
      id: request.sourceEntityId,
    });
    if (!deck) {
      return undefined;
    }

    const carouselContent = buildCarouselContent(deck, {
      brandLabel: this.resolveBrandLabel(),
    });
    if (carouselContent.slides.length > DEFAULT_MAX_SLIDES) {
      throw new Error(
        `Refusing to render carousel with ${carouselContent.slides.length} slides; maxSlides=${DEFAULT_MAX_SLIDES}`,
      );
    }
    const themeMode = await this.getThemeMode();
    const outputDir = await mkdtemp(join(tmpdir(), "brain-deck-carousel-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/carousel/${deck.id}`,
        template: deckCarouselTemplate,
        format: "pdf",
        content: carouselContent,
        siteConfig: { title: carouselContent.title, themeMode },
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
          filename: `${getDeckSlug(deck)}-carousel.pdf`,
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
    if (domain && domain.length > 0) {
      return domain;
    }

    const name = this.context.identity.getProfile().name;
    return name.length > 0 ? name : undefined;
  }
}

function buildCarouselContent(
  deck: DeckEntity,
  options: { brandLabel?: string | undefined } = {},
): DeckCarouselTemplateData {
  const { frontmatter, content } = parseMarkdown(deck.content);
  const title =
    typeof frontmatter["title"] === "string"
      ? frontmatter["title"]
      : deck.metadata.title;
  const eyebrow =
    typeof frontmatter["event"] === "string" && frontmatter["event"].length > 0
      ? frontmatter["event"]
      : undefined;
  const slides = content
    .split(/^---$/gm)
    .map((slide) => slide.trim())
    .filter((slide) => slide.length > 0)
    .map((markdown) => ({ markdown }));

  return {
    title,
    slides,
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
    ...(eyebrow ? { eyebrow } : {}),
  };
}

function getDeckSlug(deck: DeckEntity): string {
  const metadataSlug = deck.metadata.slug;
  return metadataSlug.length > 0 ? metadataSlug : slugify(deck.metadata.title);
}
