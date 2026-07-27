import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  createMediaContentHelpers,
  preferredSlug,
  renderPrintablePdf,
  type RenderPdf,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import type { DeckEntity } from "../schemas/deck";
import {
  deckCarouselTemplate,
  type DeckCarouselTemplateData,
} from "./carousel-template";

const DEFAULT_MAX_SLIDES = 20;

export type { RenderPdf };

export type GetThemeMode = () => Promise<"light" | "dark">;

export interface DeckCarouselAttachmentProviderDeps {
  renderPdf?: RenderPdf;
  getThemeMode?: GetThemeMode;
}

/**
 * Renders a deck to a multi-slide carousel PDF. Unlike the printable and OG
 * providers this one resolves its theme mode at request time and caps slide
 * count, so it drives the shared render primitive directly instead of going
 * through `createPrintableProvider`.
 */
export class DeckCarouselAttachmentProvider implements AttachmentProvider {
  readonly metadata = { outputEntityType: "document" } as const;

  private readonly context: Pick<
    EntityPluginContext,
    "entityService" | "themeCSS" | "identity" | "domain"
  >;
  private readonly renderPdf: RenderPdf | undefined;
  private readonly getThemeMode: GetThemeMode;

  constructor(
    context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: DeckCarouselAttachmentProviderDeps = {},
  ) {
    this.context = context;
    this.renderPdf = deps.renderPdf;
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

    const { brandLabel } = createMediaContentHelpers(this.context);
    const carouselContent = buildCarouselContent(deck, { brandLabel });
    if (carouselContent.slides.length > DEFAULT_MAX_SLIDES) {
      throw new Error(
        `Refusing to render carousel with ${carouselContent.slides.length} slides; maxSlides=${DEFAULT_MAX_SLIDES}`,
      );
    }

    const pdf = await renderPrintablePdf({
      mediaPath: `/_media/carousel/${deck.id}`,
      template: deckCarouselTemplate,
      content: carouselContent,
      title: carouselContent.title,
      themeMode: await this.getThemeMode(),
      themeCSS: this.context.themeCSS,
      tmpPrefix: "brain-deck-carousel-",
      ...(this.renderPdf ? { renderPdf: this.renderPdf } : {}),
    });

    return {
      type: "document",
      data: pdf,
      mimeType: "application/pdf",
      filename: `${preferredSlug(deck.metadata.slug, deck.metadata.title)}-carousel.pdf`,
    };
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
