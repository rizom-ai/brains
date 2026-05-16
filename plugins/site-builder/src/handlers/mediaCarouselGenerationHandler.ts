import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ServicePluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, parseMarkdown, slugify, z } from "@brains/utils";
import {
  MediaDocumentGenerationJobHandler,
  type MediaDocumentGenerationHandlerDeps,
  type RenderPdf,
} from "./mediaDocumentGenerationHandler";
import {
  LINKEDIN_CAROUSEL_TEMPLATE_NAME,
  linkedinCarouselTemplate,
  type LinkedinCarouselTemplateData,
} from "../lib/linkedin-carousel-template";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "../lib/media-render-page";

export const mediaCarouselGenerationJobSchema = z.object({
  socialPostId: z.string().min(1),
  templateName: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  maxPageCount: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  format: z.string().optional(),
});

export type MediaCarouselGenerationJobData = z.infer<
  typeof mediaCarouselGenerationJobSchema
>;

export interface MediaCarouselGenerationResult {
  success: true;
  documentId: string;
  slideCount: number;
}

export interface MediaCarouselGenerationHandlerDeps extends MediaDocumentGenerationHandlerDeps {
  renderPdf?: RenderPdf;
}

export class MediaCarouselGenerationJobHandler extends BaseJobHandler<
  "media-carousel-generate",
  MediaCarouselGenerationJobData,
  MediaCarouselGenerationResult
> {
  constructor(
    logger: Logger,
    private readonly context: Pick<ServicePluginContext, "entityService">,
    private readonly deps: MediaCarouselGenerationHandlerDeps = {},
  ) {
    super(logger, {
      schema: mediaCarouselGenerationJobSchema,
      jobTypeName: "media-carousel-generate",
    });
  }

  async process(
    data: MediaCarouselGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<MediaCarouselGenerationResult> {
    this.logger.debug("Starting media carousel generation job", {
      jobId,
      socialPostId: data.socialPostId,
    });

    const socialPost = await this.context.entityService.getEntity({
      entityType: "social-post",
      id: data.socialPostId,
    });
    if (!socialPost) {
      throw new Error(`Social post not found: ${data.socialPostId}`);
    }

    const { frontmatter: socialFrontmatter } = parseMarkdown(
      socialPost.content,
    );
    const sourceEntityType = socialFrontmatter["sourceEntityType"];
    const sourceEntityId = socialFrontmatter["sourceEntityId"];
    if (sourceEntityType !== "deck" || typeof sourceEntityId !== "string") {
      throw new Error(
        `Social post ${data.socialPostId} must reference a deck source`,
      );
    }

    const deck = await this.context.entityService.getEntity({
      entityType: "deck",
      id: sourceEntityId,
    });
    if (!deck) {
      throw new Error(`Source deck not found: ${sourceEntityId}`);
    }

    const carouselContent = buildCarouselContent(deck.content);
    const templateName = data.templateName ?? LINKEDIN_CAROUSEL_TEMPLATE_NAME;
    const documentId = slugify(
      data.documentId ?? `${data.socialPostId}-carousel`,
    );
    const outputDir = await mkdtemp(join(tmpdir(), "brain-media-carousel-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/carousel/${data.socialPostId}`,
        template: linkedinCarouselTemplate,
        format: "pdf",
        content: carouselContent,
        siteConfig: { title: carouselContent.title },
      });

      const server = await startStaticRenderServer({ rootDir: outputDir });
      try {
        const renderUrl = server.urlFor(page.urlPath);
        const mediaDocumentHandler = new MediaDocumentGenerationJobHandler(
          this.logger.child("MediaDocumentGenerationJobHandler"),
          this.context,
          this.deps,
        );

        const result = await mediaDocumentHandler.process(
          {
            renderUrl,
            sourceEntityType: "deck",
            sourceEntityId,
            sourceTemplate: templateName,
            documentId,
            title: carouselContent.title,
            filename: `${documentId}.pdf`,
            dedupKey: `${templateName}:deck:${sourceEntityId}:${deck.contentHash}`,
            // Intentionally omit `pageCount` here: the inner handler's
            // post-render `countPdfPages` check is the authoritative limit.
            // Passing the slide count would conflate "slides" with "PDF
            // pages" (they can diverge if a slide wraps), and would only
            // ever be used as a redundant pre-render hint.
            targetEntityType: "social-post",
            targetEntityId: data.socialPostId,
            ...(data.maxPageCount !== undefined && {
              maxPageCount: data.maxPageCount,
            }),
            ...(data.maxBytes !== undefined && { maxBytes: data.maxBytes }),
            ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs }),
            ...(data.width !== undefined && { width: data.width }),
            ...(data.height !== undefined && { height: data.height }),
            ...(data.format !== undefined && { format: data.format }),
          },
          jobId,
          progressReporter,
        );

        return {
          success: true,
          documentId: result.documentId,
          slideCount: carouselContent.slides.length,
        };
      } finally {
        await server.close();
      }
    } catch (error) {
      this.logger.error("Media carousel generation failed", {
        jobId,
        socialPostId: data.socialPostId,
        error: getErrorMessage(error),
      });
      throw error;
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
}

function buildCarouselContent(
  deckContent: string,
): LinkedinCarouselTemplateData {
  const { frontmatter, content } = parseMarkdown(deckContent);
  const title =
    typeof frontmatter["title"] === "string" ? frontmatter["title"] : "Deck";
  const slides = content
    .split(/^---$/gm)
    .map((slide) => slide.trim())
    .filter((slide) => slide.length > 0)
    .map((markdown) => ({ markdown }));

  if (slides.length === 0) {
    throw new Error("Source deck has no slides");
  }

  return { title, slides };
}
