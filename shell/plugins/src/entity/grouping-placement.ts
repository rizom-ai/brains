import type { EntityGrouping } from "@brains/entity-service";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

/** The groupings a type takes part in. */
function applyingTo(
  entityType: string,
  groupings: readonly EntityGrouping[],
): EntityGrouping[] {
  return groupings.filter(({ types }) => types.includes(entityType));
}

/** The frontmatter a document states, when it states a record. */
function statedFrontmatter(content: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(content);
  return isPlainRecord(data) ? data : {};
}

/** Whether a document states a value in one of the groupings. */
function belongsToOne(
  frontmatter: Record<string, unknown>,
  groupings: readonly EntityGrouping[],
): boolean {
  return groupings.some(({ field }) => {
    const values = frontmatter[field];
    return (
      Array.isArray(values) &&
      values.some((value) => typeof value === "string" && value.trim() !== "")
    );
  });
}

/**
 * Why a record of a type that must belong somewhere may not be saved: a
 * grouping applies to the type and the record's file states a value in none
 * of them. The membership is read from the file as authored, as the
 * grouping checks read it, never from metadata a caller supplied: only the
 * file's values are stored. No grouping for the type asks nothing, and the
 * placeholder of a generation, queued or failed, has nothing to place yet;
 * its status is the record's own, stated in the file or in its metadata.
 */
export function missingGroupingMembership(
  entity: {
    readonly entityType: string;
    readonly content: string;
    readonly metadata: Record<string, unknown>;
  },
  groupings: readonly EntityGrouping[],
): z.core.$ZodIssue | undefined {
  const { entityType } = entity;
  const applying = applyingTo(entityType, groupings);
  if (applying.length === 0) return undefined;
  const frontmatter = statedFrontmatter(entity.content);
  const status = frontmatter["status"] ?? entity.metadata["status"];
  if (status === "generating" || status === "failed") return undefined;
  return belongsToOne(frontmatter, applying)
    ? undefined
    : {
        code: "custom",
        path: applying.map(({ field }) => field).slice(0, 1),
        message: `A ${entityType} belongs to at least one of: ${applying
          .map(({ label }) => label)
          .join(", ")}.`,
        input: undefined,
      };
}

/** What the brain answers when it places a record: one grouping, one value. */
export const groupingChoiceSchema: z.ZodObject<{
  grouping: z.ZodString;
  value: z.ZodString;
}> = z.object({
  grouping: z.string().describe("The key of the grouping chosen"),
  value: z.string().describe("The one value chosen in that grouping"),
});

export type GroupingChoice = z.output<typeof groupingChoiceSchema>;

/** How much of what was written the brain reads to place it. */
const PLACEMENT_TEXT_LIMIT = 4000;

const quoted = (values: readonly string[]): string =>
  values.map((value) => `"${value}"`).join(", ");

export interface GroupingPlacement {
  readonly entityType: string;
  /** What the generation wrote, with any frontmatter it stated. */
  readonly content: string;
  /** The allocated placeholder's document, when the generation fills one. */
  readonly heldContent?: string | undefined;
  readonly title?: string | undefined;
  /** What the requester asked for, which may say where it belongs. */
  readonly direction?: string | undefined;
  readonly groupings: readonly EntityGrouping[];
  /** The values an open grouping already holds, most used first. */
  valuesInUse(grouping: EntityGrouping): Promise<readonly string[]>;
  choose(prompt: string): Promise<GroupingChoice>;
}

/**
 * Place what a generation wrote in a grouping, when its type must belong
 * somewhere and neither the generation nor the placeholder it fills states
 * a membership: the brain chooses one grouping and one value in it, from
 * the values a closed grouping allows or the values an open one holds, and
 * the membership is written into the document's frontmatter. A choice the
 * groupings do not allow is refused, so nothing is saved unplaced.
 */
export async function placeInGrouping(
  placement: GroupingPlacement,
): Promise<{ readonly content: string } | { readonly refuse: string }> {
  const { entityType, content } = placement;
  const applying = applyingTo(entityType, placement.groupings);
  const document = readMarkdownFrontmatter(content);
  const frontmatter = isPlainRecord(document.data) ? document.data : {};
  if (
    applying.length === 0 ||
    belongsToOne(frontmatter, applying) ||
    belongsToOne(statedFrontmatter(placement.heldContent ?? ""), applying)
  ) {
    return { content };
  }
  const options = await Promise.all(
    applying.map(async (grouping) => ({
      grouping,
      inUse: grouping.values ? [] : await placement.valuesInUse(grouping),
    })),
  );
  const choice = await placement.choose(
    [
      `Choose the grouping this ${entityType} belongs to, and one value in it.`,
      "",
      "Groupings:",
      ...options.map(({ grouping, inUse }) => {
        const name = `- ${grouping.key} ("${grouping.label}")`;
        if (grouping.values) {
          return `${name}: choose one of ${quoted(grouping.values)}`;
        }
        return inUse.length > 0
          ? `${name}: choose a value in use (${quoted(inUse)}) or state a new one`
          : `${name}: state a value`;
      }),
      "",
      "Prefer a value that already exists over a new one for the same thing.",
      ...(placement.direction
        ? ["", `What the user asked for: ${placement.direction}`]
        : []),
      ...(placement.title ? ["", `Title: ${placement.title}`] : []),
      "",
      document.content.trim().slice(0, PLACEMENT_TEXT_LIMIT),
    ].join("\n"),
  );
  const chosen = applying.find(({ key }) => key === choice.grouping);
  const value = choice.value.trim();
  if (!chosen || value === "" || chosen.values?.includes(value) === false) {
    return {
      refuse: `The ${entityType} could not be placed in a grouping: "${choice.value}" in "${choice.grouping}" is not a value its groupings allow (${applying
        .map(({ label }) => label)
        .join(", ")}).`,
    };
  }
  return {
    content: generateMarkdown(
      { ...frontmatter, [chosen.field]: [value] },
      document.content,
    ),
  };
}
