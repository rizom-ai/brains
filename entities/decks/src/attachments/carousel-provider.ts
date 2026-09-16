import type {
  FileAttachmentProvider,
  AttachmentFileConsumer,
  AttachmentFileOptions,
  AttachmentResolveRequest,
} from "@brains/plugins";
import {
  createPrintableProvider,
  preferredSlug,
  type MediaAttachmentContext,
  type MediaThemeMode,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import { deckSchema, type DeckEntity } from "../schemas/deck";
import {
  deckCarouselTemplate,
  DECK_CAROUSEL_ATTACHMENT_TYPE,
  type DeckCarouselTemplateData,
} from "./carousel-template";

const DEFAULT_MAX_SLIDES = 20;

export type GetThemeMode = () => Promise<MediaThemeMode>;

export interface DeckCarouselAttachmentProviderDeps {
  getThemeMode?: GetThemeMode;
}

/** Slide selection and live theme lookup stay metadata-only. The shared file
 * provider owns referenced files, actor production and borrowed output lifetime.
 */
export class DeckCarouselAttachmentProvider implements FileAttachmentProvider {
  readonly metadata = { outputEntityType: "document" } as const;
  private readonly provider: FileAttachmentProvider;

  constructor(
    context: MediaAttachmentContext,
    deps: DeckCarouselAttachmentProviderDeps = {},
  ) {
    this.provider = createPrintableProvider({
      sourceEntityType: "deck",
      entitySchema: deckSchema,
      attachmentType: DECK_CAROUSEL_ATTACHMENT_TYPE,
      template: deckCarouselTemplate,
      themeMode:
        deps.getThemeMode ?? (async (): Promise<MediaThemeMode> => "dark"),
      buildContent: (deck, helpers): DeckCarouselTemplateData => {
        const content = buildCarouselContent(deck, {
          brandLabel: helpers.brandLabel,
        });
        if (content.slides.length > DEFAULT_MAX_SLIDES)
          throw new Error(
            `Refusing to render carousel with ${content.slides.length} slides; maxSlides=${DEFAULT_MAX_SLIDES}`,
          );
        return content;
      },
      pageTitle: (content) => content.title,
      slug: (deck) => preferredSlug(deck.metadata.slug, deck.metadata.title),
      filename: (deck) =>
        `${preferredSlug(deck.metadata.slug, deck.metadata.title)}-carousel.pdf`,
    })(context);
  }

  withFile<T>(
    request: AttachmentResolveRequest,
    use: AttachmentFileConsumer<T>,
    options?: AttachmentFileOptions,
  ): Promise<T | undefined> {
    return this.provider.withFile(request, use, options);
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
