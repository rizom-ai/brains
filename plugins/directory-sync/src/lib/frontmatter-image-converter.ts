import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  getErrorMessage,
  isHttpUrl,
  fetchImageAsBase64,
  slugify,
  parseMarkdown,
  generateMarkdown,
  z,
} from "@brains/utils";
import { getOrCreateImageEntity } from "./image-entity-helper";

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

/**
 * Detection result for coverImageUrl in frontmatter
 * Contains all info needed to queue an image conversion job
 */
export interface CoverImageDetection {
  sourceUrl: string;
  postTitle: string;
  postSlug: string;
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
   * Detect if content has a coverImageUrl that needs conversion
   * This is a sync method for quick detection before queueing a job
   *
   * @returns Detection info if conversion is needed, null otherwise
   */
  detectCoverImageUrl(content: string): CoverImageDetection | null {
    // Parse frontmatter
    let parsed;
    try {
      parsed = parseMarkdown(content);
    } catch {
      return null;
    }

    const { frontmatter } = parsed;

    // Validate frontmatter has coverImageUrl
    const result = coverImageFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      return null;
    }

    // Skip if already converted
    if (result.data.coverImageId) {
      return null;
    }

    const { title, slug, coverImageUrl, coverImageAlt } = result.data;

    // Skip if not an HTTP URL
    if (!isHttpUrl(coverImageUrl)) {
      return null;
    }

    return {
      sourceUrl: coverImageUrl,
      postTitle: title,
      postSlug: slug ?? slugify(title),
      customAlt: coverImageAlt,
    };
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
      const imageId = await this.createImageEntity(imageContext);

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
        error: getErrorMessage(error),
      });
      return { content, converted: false };
    }
  }

  private async createImageEntity(context: ImageContext): Promise<string> {
    const { postTitle, postSlug, sourceUrl, customAlt } = context;
    const imageTitle = `Cover image for ${postTitle}`;
    return getOrCreateImageEntity(
      {
        id: `${postSlug}-cover`,
        title: imageTitle,
        alt: customAlt ?? imageTitle,
        sourceUrl,
      },
      this.entityService,
      this.fetcher,
      this.logger,
    );
  }
}
