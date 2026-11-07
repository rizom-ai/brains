import { formatVoiceGuidance, styleGuideFromRecord } from "@brains/contracts";
import {
  defineProjectionRule,
  z,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { slugify } from "@brains/utils/string-utils";
import { createSeriesBodyFormatter } from "../schemas/series";
import { getSeriesName } from "./series-metadata";

const seriesMemberSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  excerpt: z.string().nullable(),
  seriesName: z.string(),
});

const existingSeriesSchema = z.object({
  id: z.string(),
  content: z.string(),
  title: z.string(),
  slug: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  hasDescription: z.boolean(),
});

const seriesProjectionInputSchema = z.object({
  members: z.array(seriesMemberSchema),
  existingSeries: z.array(existingSeriesSchema),
  voiceGuidance: z.string(),
});

type SeriesProjectionInput = z.output<typeof seriesProjectionInputSchema>;

function memberInput(entity: {
  readonly id: string;
  readonly metadata: unknown;
}): z.output<typeof seriesMemberSchema> | null {
  const seriesName = getSeriesName(entity);
  if (!seriesName) return null;
  const metadata = z
    .object({ title: z.string().optional(), excerpt: z.string().optional() })
    .parse(entity.metadata);
  return {
    id: entity.id,
    seriesName,
    title: metadata.title ?? null,
    excerpt: metadata.excerpt ?? null,
  };
}

function hasSeriesDescription(content: string): boolean {
  return /^## Description\s*\n\s*\S/m.test(content);
}

async function selectSeriesInput(
  context: Parameters<ProjectionRule["selectInput"]>[1],
): Promise<SeriesProjectionInput> {
  const entityTypes = context.entities
    .getEntityTypes()
    .filter((entityType) => entityType !== "series")
    .sort();
  const members = (
    await Promise.all(
      entityTypes.map(async (entityType) =>
        context.entities.listEntities({ entityType }),
      ),
    )
  )
    .flat()
    .map(memberInput)
    .filter((member): member is NonNullable<typeof member> => member !== null)
    .sort(
      (left, right) =>
        left.seriesName.localeCompare(right.seriesName) ||
        left.id.localeCompare(right.id),
    );
  // Read as stored: a series is declared, so its read is its body alone,
  // and a described series is upserted with the document it already is.
  const existingSeries = (
    await context.entities.listEntities({
      entityType: "series",
      options: { source: true },
    })
  )
    .map((entity) => {
      const parsedMetadata = z
        .object({ title: z.string(), slug: z.string() })
        .parse(entity.metadata);
      return {
        id: entity.id,
        content: entity.content,
        title: parsedMetadata.title,
        slug: parsedMetadata.slug,
        visibility: entity.visibility,
        hasDescription: hasSeriesDescription(entity.content),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const styleGuideEntity = await context.entities.getEntity({
    entityType: "style-guide",
    id: "style-guide",
  });
  const voiceGuidance = styleGuideEntity
    ? formatVoiceGuidance(styleGuideFromRecord(styleGuideEntity))
    : "";
  return { members, existingSeries, voiceGuidance };
}

/**
 * The cover a stored series names in its frontmatter. The series' metadata
 * carries it too, and an upsert names it so the written metadata keeps it.
 */
function storedCoverImageId(content: string | undefined): string | null {
  if (content === undefined) return null;
  const cover = z
    .looseObject({ coverImageId: z.string().optional() })
    .safeParse(readMarkdownFrontmatter(content).data);
  return cover.success ? (cover.data.coverImageId ?? null) : null;
}

async function deriveSeries(
  descriptionTemplate: string,
  input: SeriesProjectionInput,
  context: Parameters<ProjectionRule["derive"]>[1],
  signal: AbortSignal,
): Promise<readonly ProjectionWriteIntent[]> {
  const membersBySeries = new Map<string, typeof input.members>();
  for (const member of input.members) {
    const members = membersBySeries.get(member.seriesName) ?? [];
    members.push(member);
    membersBySeries.set(member.seriesName, members);
  }

  const existingById = new Map(
    input.existingSeries.map((series) => [series.id, series]),
  );
  const activeIds = new Set<string>();
  const intents: ProjectionWriteIntent[] = [];

  for (const [seriesName, members] of [...membersBySeries.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (signal.aborted) throw signal.reason;
    const id = slugify(seriesName);
    activeIds.add(id);
    const existing = existingById.get(id);
    let content = existing?.content;

    if (!content || !existing?.hasDescription) {
      const memberSummaries = members.map(
        (member) => `- "${member.title ?? member.id}": ${member.excerpt ?? ""}`,
      );
      const generated = await context.ai.generate(
        {
          prompt: `Series name: ${seriesName}\n\nContent in this series:\n${memberSummaries.join("\n")}`,
          templateName: descriptionTemplate,
          representedIdentity: "none",
          ...(input.voiceGuidance && {
            styleGuide: { voice: input.voiceGuidance },
          }),
        },
        z.object({ description: z.string() }),
      );
      if (!generated.description) {
        throw new Error(
          `Failed to generate description for series: ${seriesName}`,
        );
      }
      const body = createSeriesBodyFormatter(seriesName).format({
        description: generated.description,
      });
      content = generateMarkdown({ title: seriesName, slug: id }, body);
    }

    const coverImageId = storedCoverImageId(existing?.content);
    intents.push({
      operation: "upsert",
      entity: {
        id,
        entityType: "series",
        content,
        metadata: {
          title: seriesName,
          slug: id,
          ...(coverImageId !== null && { coverImageId }),
        },
        visibility: existing?.visibility ?? "public",
      },
    });
  }

  for (const existing of input.existingSeries) {
    if (!activeIds.has(existing.id)) {
      intents.push({
        operation: "delete",
        entityType: "series",
        id: existing.id,
      });
    }
  }

  return intents;
}

/**
 * The rule that derives every series from the members of every other type,
 * describing a new or undescribed one through the description template,
 * named as the runtime registered it.
 */
export function createSeriesProjectionRule(
  descriptionTemplate: string,
): ProjectionRule {
  return defineProjectionRule({
    id: "series-projection",
    version: "1",
    sources: [{ kind: "entity", types: ["*"], excludeTypes: ["series"] }],
    targetType: "series",
    inputSchema: seriesProjectionInputSchema,
    selectInput: async (_trigger, context) => selectSeriesInput(context),
    derive: (input, context, signal) =>
      deriveSeries(descriptionTemplate, input, context, signal),
  });
}
