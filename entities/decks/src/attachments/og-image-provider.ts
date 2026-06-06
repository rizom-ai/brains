import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  renderOgImagePng,
  type ScreenshotPng,
} from "@brains/media-page-composer";
import { parseMarkdown, slugify } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";
import { deckFrontmatterSchema } from "../schemas/deck";
import {
  DECK_OG_IMAGE_ATTACHMENT_TYPE,
  deckOgImageTemplate,
  type DeckOgImageTemplateData,
} from "./og-image-template";

export interface DeckOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class DeckOgImageAttachmentProvider implements AttachmentProvider {
  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    private readonly deps: DeckOgImageAttachmentProviderDeps = {},
  ) {}

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

    const { frontmatter, content: body } = parseMarkdown(deck.content);
    const parsed = deckFrontmatterSchema.parse(frontmatter);
    const slideCount = countSlides(body);
    const brandLabel = this.resolveBrandLabel();
    const coverImageUrl = await this.resolveCoverImageUrl(parsed.coverImageId);
    const content: DeckOgImageTemplateData = {
      title: parsed.title,
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.event ? { event: parsed.event } : {}),
      ...(slideCount ? { slideCount } : {}),
      ...(coverImageUrl ? { coverImageUrl } : {}),
      ...(brandLabel ? { brandLabel } : {}),
    };

    const png = await renderOgImagePng({
      mediaPath: `/_media/og/deck/${deck.id}`,
      template: deckOgImageTemplate,
      content,
      title: content.title,
      themeMode: "dark",
      themeCSS: this.context.themeCSS,
      tmpPrefix: "brain-deck-og-image-",
      ...(this.deps.screenshotPng && {
        screenshotPng: this.deps.screenshotPng,
      }),
    });

    return {
      type: "image",
      data: png,
      mimeType: "image/png",
      filename: `${getDeckSlug(deck)}-og.png`,
    };
  }

  private resolveBrandLabel(): string | undefined {
    const domain = this.context.domain?.trim();
    if (domain && domain.length > 0) return domain;

    const name = this.context.identity.getProfile().name.trim();
    return name.length > 0 ? name : undefined;
  }

  private async resolveCoverImageUrl(
    coverImageId: string | undefined,
  ): Promise<string | undefined> {
    if (!coverImageId) return undefined;
    const image = await this.context.entityService.getEntity({
      entityType: "image",
      id: coverImageId,
    });
    return image?.content.startsWith("data:image/") ? image.content : undefined;
  }
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
