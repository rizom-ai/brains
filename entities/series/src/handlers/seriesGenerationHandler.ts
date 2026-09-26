import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  z,
  computeContentHash,
  type EntityJobDeclaration,
  type JobEntityAccess,
} from "@brains/sdk/entities";

import { seriesSchema } from "../schemas/series";
import {
  seriesFrontmatterSchema,
  createSeriesBodyFormatter,
} from "../schemas/series";

interface SeriesGenerationJobData {
  prompt?: string | undefined;
  title?: string | undefined;
  seriesId?: string | undefined;
}

const seriesGenerationJobSchema: z.ZodType<SeriesGenerationJobData> = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  seriesId: z.string().optional(),
});

/** Member fields used to build the description prompt. */
interface MemberSummary {
  title?: string | undefined;
  excerpt?: string | undefined;
}

const memberSummarySchema: z.ZodType<MemberSummary> = z.object({
  title: z.string().optional(),
  excerpt: z.string().optional(),
});

/**
 * Rewrite a series' description from the entities it indexes.
 *
 * A declared job rather than a generation: it edits a series that already
 * exists, where a generation produces content for the runtime to persist as
 * a new or pre-allocated entity.
 */
export const seriesDescriptionJob: EntityJobDeclaration<
  typeof seriesGenerationJobSchema
> = {
  input: seriesGenerationJobSchema,
  handle: async ({ input: data, ai, entities, template }) => {
    const seriesId = data.seriesId ?? data.title;
    if (!seriesId) {
      return { success: false, error: "seriesId or title required" };
    }

    const series = await entities.getEntity(
      {
        entityType: "series",
        id: seriesId,
      },
      seriesSchema,
    );
    if (!series) {
      return { success: false, error: `Series not found: ${seriesId}` };
    }

    // Gather member content summaries across all entity types
    const summaries = await gatherMemberSummaries(
      series.metadata.title,
      entities,
    );
    if (summaries.length === 0) {
      return {
        success: false,
        error: `No members found in series: ${series.metadata.title}`,
      };
    }

    const prompt =
      data.prompt ??
      `Series name: ${series.metadata.title}\n\nContent in this series:\n${summaries.join("\n")}`;

    const generated = await ai.generate(
      {
        prompt,
        templateName: template("description"),
        representedIdentity: "none",
      },
      z.object({ description: z.string() }),
    );

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

    await entities.update({
      ...series,
      content: finalContent,
      contentHash: computeContentHash(finalContent),
      updated: new Date().toISOString(),
    });

    return {
      success: true,
      seriesId: series.id,
      seriesName: series.metadata.title,
      description: generated.description,
      memberCount: summaries.length,
    };
  },
};

async function gatherMemberSummaries(
  seriesName: string,
  entities: JobEntityAccess,
): Promise<string[]> {
  const summaries: string[] = [];
  const types = entities.getEntityTypes();

  for (const type of types) {
    if (type === "series") continue;
    const found = await entities.listEntities({
      entityType: type,
      options: {
        filter: { metadata: { seriesName } },
        // Deliberate cap: these summaries feed an AI prompt, so bound the
        // context size rather than walk every member of a huge series.
        limit: 100,
      },
    });
    for (const entity of found) {
      const parsed = memberSummarySchema.safeParse(entity.metadata);
      const { title, excerpt } = parsed.success ? parsed.data : {};
      summaries.push(`- "${title ?? entity.id}": ${excerpt ?? ""}`);
    }
  }

  return summaries;
}
