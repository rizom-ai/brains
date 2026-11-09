import type { AttachmentProvider } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  createMediaContentHelpers,
  preferredSlug,
  renderPrintablePdf,
  type MediaAttachmentContext,
  type RenderPdf,
} from "@brains/media-page-composer";
import { fetchSiteInfo } from "@brains/site-composition";
import { deckSchema, type DeckEntity } from "../schemas/deck";
import {
  DECK_CAROUSEL_TEMPLATE_NAME,
  type DeckCarouselTemplateInput,
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

  private readonly context: MediaAttachmentContext;
  private readonly renderPdf: RenderPdf | undefined;
  private readonly getThemeMode: GetThemeMode;

  constructor(
    context: MediaAttachmentContext,
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

    const deck = await this.context.entityService.getEntity(
      {
        entityType: "deck",
        id: request.sourceEntityId,
      },
      deckSchema,
    );
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

    const template = this.context.views.get(DECK_CAROUSEL_TEMPLATE_NAME);
    if (!template?.renderers.pdf) {
      throw new Error(`${DECK_CAROUSEL_TEMPLATE_NAME} has no pdf renderer`);
    }

    const pdf = await renderPrintablePdf({
      mediaPath: `/_media/carousel/${deck.id}`,
      template,
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
): DeckCarouselTemplateInput {
  // A deck reads back as its slides, its frontmatter its metadata.
  const title = deck.metadata.title;
  const eyebrow =
    deck.metadata.event !== undefined && deck.metadata.event.length > 0
      ? deck.metadata.event
      : undefined;
  const slides = deck.content
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

/**
 * The site's theme mode, which a deck carousel is drawn in: dark until the
 * site says otherwise, and when its site-info cannot be read.
 */
export async function siteThemeMode(
  entityService: Parameters<typeof fetchSiteInfo>[0],
): Promise<"light" | "dark"> {
  try {
    const info = await fetchSiteInfo(entityService);
    return info.themeMode ?? "dark";
  } catch {
    // No site-info yet, or one that does not parse: the carousel's default.
    return "dark";
  }
}

/**
 * The carousel provider a deck declares, drawn in the site's theme mode
 * unless the caller supplies another.
 */
export function createDeckCarouselProvider(
  context: MediaAttachmentContext,
  deps: DeckCarouselAttachmentProviderDeps = {},
): DeckCarouselAttachmentProvider {
  return new DeckCarouselAttachmentProvider(context, {
    ...deps,
    getThemeMode:
      deps.getThemeMode ??
      ((): Promise<"light" | "dark"> => siteThemeMode(context.entityService)),
  });
}
