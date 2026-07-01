import { BaseGenerationJobHandler } from "@brains/plugins";
import type { EntityPluginContext, GeneratedContent } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { parseMarkdown, slugify, z } from "@brains/utils";
import { generationResultSchema } from "@brains/contracts";
import { whitepaperAdapter } from "../adapters/whitepaper-adapter";
import type { WhitepaperFrontmatter } from "../schemas/whitepaper";

export const whitepaperGenerationJobSchema = z.object({
  entityId: z.string().optional(),
  mode: z.enum(["outline", "draft"]).optional(),
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

    const mode = data.mode ?? "outline";
    const existing = data.entityId
      ? await this.context.entityService.getEntity({
          entityType: "whitepaper",
          id: data.entityId,
          visibilityScope: "restricted",
        })
      : undefined;
    const existingParsed = existing
      ? parseMarkdown(existing.content)
      : undefined;
    const prompt = this.buildPrompt(data, existingParsed?.content);
    const generated = await this.context.ai.generate<{
      title: string;
      subtitle: string;
      thesis: string;
      abstract: string;
      keywords: string[];
      body: string;
    }>({
      prompt,
      templateName:
        mode === "draft"
          ? "whitepaper:draft-expansion"
          : "whitepaper:generation",
    });

    const existingTitle =
      typeof existingParsed?.frontmatter["title"] === "string"
        ? existingParsed.frontmatter["title"]
        : undefined;
    const title = data.title ?? existingTitle ?? generated.title;
    const slug = slugify(data.entityId ?? title);
    const frontmatter: WhitepaperFrontmatter = {
      title,
      status: mode === "draft" ? "draft" : "outline",
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
        status: frontmatter.status,
      },
      title,
      resultExtras: { title, slug },
    };
  }

  private buildPrompt(
    data: WhitepaperGenerationJobData,
    existingBody?: string,
  ): string {
    const parts = [data.prompt];
    if (existingBody) {
      parts.push(`Existing white paper content:\n${existingBody}`);
    }
    if (data.content) {
      parts.push(`Additional source material:\n${data.content}`);
    }
    return parts.join("\n\n");
  }

  protected override summarizeDataForLog(
    data: WhitepaperGenerationJobData,
  ): Record<string, unknown> {
    return {
      prompt: data.prompt,
      title: data.title,
      mode: data.mode,
      hasContent: Boolean(data.content),
      hasEntityId: Boolean(data.entityId),
    };
  }
}
