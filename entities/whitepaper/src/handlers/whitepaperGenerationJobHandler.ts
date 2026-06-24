import { BaseGenerationJobHandler } from "@brains/plugins";
import type { EntityPluginContext, GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { slugify, z } from "@brains/utils";
import { generationResultSchema } from "@brains/contracts";
import { whitepaperAdapter } from "../adapters/whitepaper-adapter";
import type { WhitepaperFrontmatter } from "../schemas/whitepaper";

export const whitepaperGenerationJobSchema = z.object({
  entityId: z.string().optional(),
  prompt: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
});

export type WhitepaperGenerationJobData = z.infer<
  typeof whitepaperGenerationJobSchema
>;

export const whitepaperGenerationResultSchema = generationResultSchema.extend({
  title: z.string().optional(),
  slug: z.string().optional(),
});

export type WhitepaperGenerationResult = z.infer<
  typeof whitepaperGenerationResultSchema
>;

export class WhitepaperGenerationJobHandler extends BaseGenerationJobHandler<
  WhitepaperGenerationJobData,
  WhitepaperGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: whitepaperGenerationJobSchema,
      jobTypeName: "whitepaper-generation",
      entityType: "whitepaper",
    });
  }

  protected async generate(
    data: WhitepaperGenerationJobData,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Generating white paper outline with AI",
    });

    const generated = await this.context.ai.generate<{
      title: string;
      subtitle: string;
      thesis: string;
      abstract: string;
      keywords: string[];
      body: string;
    }>({
      prompt: data.content
        ? `${data.prompt}\n\nSource material:\n${data.content}`
        : data.prompt,
      templateName: "whitepaper:generation",
    });

    const title = data.title ?? generated.title;
    const slug = slugify(data.entityId ?? title);
    const frontmatter: WhitepaperFrontmatter = {
      title,
      status: "outline",
      slug,
      ...(generated.subtitle.trim() && { subtitle: generated.subtitle }),
      thesis: generated.thesis,
      abstract: generated.abstract,
      ...(generated.keywords.length && { keywords: generated.keywords }),
    };

    await this.reportProgress(progressReporter, {
      progress: 50,
      message: `Generated white paper outline: "${title}"`,
    });

    return {
      id: slug,
      content: whitepaperAdapter.createWhitepaperContent(
        frontmatter,
        generated.body,
      ),
      metadata: {
        title,
        slug,
        status: "outline",
      },
      title,
      resultExtras: { title, slug },
    };
  }

  protected override summarizeDataForLog(
    data: WhitepaperGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
      hasContent: Boolean(data.content),
    };
  }
}
