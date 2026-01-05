import type { IEntityService, Logger } from "@brains/plugins";
import {
  isHttpUrl,
  fetchImageAsBase64,
  slugify,
  parseMarkdown,
  generateMarkdown,
  z,
} from "@brains/utils";
import {
  parseDataUrl,
  detectImageFormat,
  detectImageDimensions,
} from "@brains/image";

/**
 * Result of image URL conversion
 */
export interface ConversionResult {
  /** The (potentially modified) content */
  content: string;
  /** Whether any conversion was performed */
  converted: boolean;
  /** The image entity ID if created or found */
  imageId?: string;
}

/**
 * Schema for frontmatter with coverImageUrl that needs conversion
 */
const coverImageFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  coverImageUrl: z.string().url(),
  coverImageId: z.string().optional(),
  coverImageAlt: z.string().optional(),
});

/**
 * Context for creating an image entity from post frontmatter
 */
interface ImageContext {
  postTitle: string;
  postSlug: string;
  sourceUrl: string;
  customAlt?: string | undefined;
}

/** Function to fetch an image URL and return base64 data URL */
export type ImageFetcher = (url: string) => Promise<string>;

/**
 * Converts coverImage URLs in frontmatter to coverImageId references
 *
 * When a markdown file has `coverImage: https://...` in frontmatter:
 * 1. Fetches the image from the URL
 * 2. Creates an image entity (or reuses existing by sourceUrl)
 * 3. Replaces coverImage with coverImageId in the frontmatter
 */
export class FrontmatterImageConverter {
  private logger: Logger;

  constructor(
    private entityService: IEntityService,
    logger: Logger,
    private fetcher: ImageFetcher = fetchImageAsBase64,
  ) {
    this.logger = logger.child("FrontmatterImageConverter");
  }

  /**
   * Convert coverImageUrl to coverImageId in frontmatter
   * Works on any markdown content with a coverImageUrl HTTP URL
   */
  async convert(content: string): Promise<ConversionResult> {
    // Parse frontmatter
    let parsed;
    try {
      parsed = parseMarkdown(content);
    } catch (e) {
      this.logger.debug("Parse failed", { error: e });
      return { content, converted: false };
    }

    const { frontmatter } = parsed;

    // Validate frontmatter has coverImageUrl
    const result = coverImageFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      return { content, converted: false };
    }

    // Skip if already converted
    if (result.data.coverImageId) {
      return { content, converted: false };
    }

    const { title, slug, coverImageUrl, coverImageAlt } = result.data;

    // Skip if not an HTTP URL
    if (!isHttpUrl(coverImageUrl)) {
      return { content, converted: false };
    }

    // Build context for image creation
    const imageContext: ImageContext = {
      postTitle: title,
      postSlug: slug ?? slugify(title),
      sourceUrl: coverImageUrl,
      customAlt: coverImageAlt,
    };

    // Convert the image URL
    try {
      const imageId = await this.getOrCreateImageEntity(imageContext);

      // Clone frontmatter and replace coverImageUrl with coverImageId
      const newFrontmatter = { ...frontmatter };
      delete newFrontmatter["coverImageUrl"];
      delete newFrontmatter["coverImageAlt"];
      newFrontmatter["coverImageId"] = imageId;

      return {
        content: generateMarkdown(newFrontmatter, parsed.content),
        converted: true,
        imageId,
      };
    } catch (error) {
      this.logger.warn("Failed to convert coverImageUrl", {
        url: coverImageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return { content, converted: false };
    }
  }

  /**
   * Get existing image entity by sourceUrl or create new one
   */
  private async getOrCreateImageEntity(context: ImageContext): Promise<string> {
    const { postTitle, postSlug, sourceUrl, customAlt } = context;

    // Check for existing image with this sourceUrl (deduplication)
    const existing = await this.entityService.listEntities("image", {
      filter: { metadata: { sourceUrl } },
      limit: 1,
    });

    if (existing[0]) {
      this.logger.debug("Reusing existing image entity", {
        sourceUrl,
        imageId: existing[0].id,
      });
      return existing[0].id;
    }

    // Fetch the image and create new entity
    const dataUrl = await this.fetcher(sourceUrl);

    // Extract format and dimensions from the image data
    const { base64 } = parseDataUrl(dataUrl);
    const format = detectImageFormat(base64);
    const dimensions = detectImageDimensions(base64);

    if (!format || !dimensions) {
      throw new Error("Could not detect image format or dimensions");
    }

    // Generate ID and metadata from post context
    const imageId = `${postSlug}-cover`;
    const imageTitle = `Cover image for ${postTitle}`;
    const imageAlt = customAlt ?? imageTitle;

    const result = await this.entityService.createEntity({
      id: imageId,
      entityType: "image",
      content: dataUrl,
      metadata: {
        title: imageTitle,
        alt: imageAlt,
        format,
        width: dimensions.width,
        height: dimensions.height,
        sourceUrl,
      },
    });

    this.logger.debug("Created image entity from URL", {
      sourceUrl,
      imageId: result.entityId,
    });

    return result.entityId;
  }
}
