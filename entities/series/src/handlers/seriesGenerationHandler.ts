import type { JobHandler } from "@brains/job-queue";
import type { EntityPluginContext } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { Series } from "../schemas/series";
import {
  seriesFrontmatterSchema,
  createSeriesBodyFormatter,
} from "../schemas/series";

const seriesGenerationJobSchema = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  seriesId: z.string().optional(),
});

type SeriesGenerationJobData = z.infer<typeof seriesGenerationJobSchema>;

/**
 * Generation handler for series entities.
 * Generates AI descriptions from the series' member entities.
 */
export class SeriesGenerationHandler implements JobHandler<
  string,
  SeriesGenerationJobData
> {
  constructor(
    private readonly logger: Logger,
    private readonly context: EntityPluginContext,
  ) {}

  async process(data: SeriesGenerationJobData): Promise<unknown> {
    const seriesId = data.seriesId ?? data.title;
    if (!seriesId) {
      return { success: false, error: "seriesId or title required" };
    }

    const series = await this.context.entityService.getEntity<Series>(
      "series",
      seriesId,
    );
    if (!series) {
      return { success: false, error: `Series not found: ${seriesId}` };
    }

    // Gather member content summaries across all entity types
    const summaries = await this.gatherMemberSummaries(series.metadata.title);
    if (summaries.length === 0) {
      return {
        success: false,
        error: `No members found in series: ${series.metadata.title}`,
      };
    }

    const prompt =
      data.prompt ??
      `Series name: ${series.metadata.title}\n\nContent in this series:\n${summaries.join("\n")}`;

    const generated = await this.context.ai.generate<{
      description: string;
    }>({
      prompt,
      templateName: "series:description",
    });

    if (!generated.description) {
      return { success: false, error: "Failed to generate description" };
    }

    // Update series entity with generated description
    const parsed = parseMarkdownWithFrontmatter(
      series.content,
      seriesFrontmatterSchema,
    );
    const formatter = createSeriesBodyFormatter(series.metadata.title);
    const newBody = formatter.format({ description: generated.description });
    const finalContent = generateMarkdownWithFrontmatter(
      newBody,
      parsed.metadata,
    );

    await this.context.entities.update({
      ...series,
      content: finalContent,
      contentHash: computeContentHash(finalContent),
      updated: new Date().toISOString(),
    });

    this.logger.info(
      `Enhanced series "${series.metadata.title}" with description`,
    );

    return {
      success: true,
      seriesId: series.id,
      seriesName: series.metadata.title,
      description: generated.description,
      memberCount: summaries.length,
    };
  }

  validateAndParse(data: unknown): SeriesGenerationJobData | null {
    const result = seriesGenerationJobSchema.safeParse(data);
    return result.success ? result.data : null;
  }

  private async gatherMemberSummaries(seriesName: string): Promise<string[]> {
    const summaries: string[] = [];
    const types = this.context.entityService.getEntityTypes();

    for (const type of types) {
      if (type === "series") continue;
      const entities = await this.context.entityService.listEntities(type, {
        filter: { metadata: { seriesName } },
        limit: 100,
      });
      for (const entity of entities) {
        const title =
          (entity.metadata as Record<string, unknown>)["title"] ?? entity.id;
        const excerpt =
          (entity.metadata as Record<string, unknown>)["excerpt"] ?? "";
        summaries.push(`- "${title}": ${excerpt}`);
      }
    }

    return summaries;
  }
}
