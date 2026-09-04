import {
  defineProjectionRule,
  generateMarkdownWithFrontmatter,
  type BaseEntity,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
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
});

type SeriesProjectionInput = z.output<typeof seriesProjectionInputSchema>;

function memberInput(
  entity: BaseEntity,
): z.output<typeof seriesMemberSchema> | null {
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
  const existingSeries = (
    await context.entities.listEntities({ entityType: "series" })
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
  return { members, existingSeries };
}

async function deriveSeries(
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
          templateName: "series:description",
          representedIdentity: "none",
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
      content = generateMarkdownWithFrontmatter(body, {
        title: seriesName,
        slug: id,
      });
    }

    intents.push({
      operation: "upsert",
      entity: {
        id,
        entityType: "series",
        content,
        metadata: { title: seriesName, slug: id },
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

export function createSeriesProjectionRule(): ProjectionRule {
  return defineProjectionRule({
    id: "series-projection",
    version: "1",
    sources: [{ kind: "entity", types: ["*"], excludeTypes: ["series"] }],
    targetType: "series",
    inputSchema: seriesProjectionInputSchema,
    selectInput: async (_trigger, context) => selectSeriesInput(context),
    derive: deriveSeries,
  });
}
