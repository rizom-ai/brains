import {
  PROJECTION_ABSTAINED,
  defineProjectionRule,
  generateMarkdownWithFrontmatter,
  type BaseEntity,
  type ProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionAbstention,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";
import { createSeriesBodyFormatter } from "../schemas/series";
import { getSeriesName } from "./series-metadata";

/**
 * The visibility this derivation owns.
 *
 * Named rather than left as a bare literal at the write site, because the
 * reconcile below has to be scoped to exactly what the derivation writes —
 * and the two drifting apart is what let a public run delete a shared series.
 */
const SERIES_TARGET_VISIBILITY = "public" as const;

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
  descriptionTemplate: z.string(),
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
  context: ProjectionInputContext,
  descriptionTemplate: string,
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
  // Scoped to what this derivation writes. Unscoped, the reconcile below
  // removes any series without a member — including ones at a visibility
  // this run never looked at, and never created.
  const existingSeries = (
    await context.entities.listEntities({
      entityType: "series",
      options: { filter: { visibilityScope: SERIES_TARGET_VISIBILITY } },
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
  return { members, existingSeries, descriptionTemplate };
}

async function deriveSeries(
  input: SeriesProjectionInput,
  context: ProjectionExecutionContext,
  signal: AbortSignal,
): Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention> {
  // A member set that is empty because nothing has been indexed yet is not
  // the same claim as "no content belongs to any series". Only the latter
  // should remove series, and it arrives as members that exist but name none.
  if (input.members.length === 0 && input.existingSeries.length > 0) {
    return PROJECTION_ABSTAINED;
  }

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
          templateName: input.descriptionTemplate,
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
        visibility: existing?.visibility ?? SERIES_TARGET_VISIBILITY,
      },
    });
  }

  return intents;
}

export function createSeriesProjectionRule(
  // Resolved by the runtime: only it knows the scope templates register
  // under, and a name written here would resolve to nothing at derive time.
  descriptionTemplate: string,
): ProjectionRule {
  return defineProjectionRule({
    id: "series-projection",
    version: "1",
    sources: [{ kind: "entity", types: ["*"], excludeTypes: ["series"] }],
    targetType: "series",
    // The latest derivation is the whole truth about public series. Declared
    // rather than diffed by hand: doing it by hand is how a public run came
    // to delete shared series.
    targets: {
      authority: "exclusive",
      visibility: SERIES_TARGET_VISIBILITY,
    },
    inputSchema: seriesProjectionInputSchema,
    selectInput: async (_trigger, context) =>
      selectSeriesInput(context, descriptionTemplate),
    derive: deriveSeries,
  });
}
