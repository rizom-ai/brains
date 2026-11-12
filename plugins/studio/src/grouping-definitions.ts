import {
  internalFullScope,
  type ServiceGroupings,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  GROUPING_DEFINITIONS_TYPE,
  groupingDefinitionsFrontmatterSchema,
  type GroupingDefinitionsFrontmatter,
} from "./grouping-definitions-contract";
import { GroupingDefinitionSource } from "./grouping-definition-source";
import {
  isGroupingContributorType,
  type StudioContext,
} from "./studio-context";

/** The definitions a grouping definitions document states; it throws when they need repair. */
export function readGroupingDefinitions(
  content: string,
): GroupingDefinitionsFrontmatter {
  return groupingDefinitionsFrontmatterSchema.parse(
    parseMarkdown(content, { cache: false }).frontmatter,
  );
}

/**
 * Install once every plugin has registered, after contributor types
 * register: the grouping definitions document is the only source.
 */
export function registerGroupingDefinitions(
  context: StudioContext,
  groupings: ServiceGroupings,
): GroupingDefinitionSource {
  const source = new GroupingDefinitionSource({
    getContributorTypes: (): string[] =>
      context.entityService
        .getEntityTypes()
        .filter((type) => isGroupingContributorType(context, type)),
    // Never resolve image references in literal labels/values. Besides changing
    // policy, those extra entity reads would recursively wait on this refresh.
    read: (): Promise<BaseEntity | null> =>
      context.entityService.getEntityRaw({
        entityType: GROUPING_DEFINITIONS_TYPE,
        id: GROUPING_DEFINITIONS_TYPE,
        visibilityScope: internalFullScope(
          "refresh the shared grouping definitions before use",
        ),
      }),
    validate: (definitions): void => groupings.validateGroupings(definitions),
    replace: (definitions, options): void =>
      groupings.replaceGroupings(definitions, options),
  });
  groupings.registerGroupingSource({
    entityType: GROUPING_DEFINITIONS_TYPE,
    ensureCurrent: (options) => source.ensureCurrent(options),
  });
  groupings.registerPersistValidator(
    GROUPING_DEFINITIONS_TYPE,
    async (entity) => {
      const { groupings: definitions } = readGroupingDefinitions(
        entity.content,
      );
      const issues: z.core.$ZodIssue[] = source
        .validateDefinitions(definitions)
        .issues.map((issue) => ({ code: "custom", ...issue }));
      if (entity.visibility !== "shared")
        issues.push({
          code: "custom",
          path: ["visibility"],
          message:
            "Grouping definitions are always shared, so the editors they constrain can read them.",
        });
      if (issues.length) throw new z.ZodError(issues);
    },
  );

  for (const type of context.entityService.getEntityTypes()) {
    if (!isGroupingContributorType(context, type)) continue;
    groupings.registerPersistValidator(type, async (entity) => {
      // The persistence boundary refreshed the source before projecting fields.
      // Read the authored values, never caller-supplied or stale row metadata.
      const definitions = Object.entries(source.getSnapshot().groupings).filter(
        ([, definition]) => !definition.excludeTypes?.includes(type),
      );
      if (definitions.length === 0) return;
      const frontmatter = parseMarkdown(entity.content, {
        cache: false,
      }).frontmatter;
      const issues: z.core.$ZodIssue[] = [];
      for (const [key, definition] of definitions) {
        const parsed = z
          .array(z.string())
          .optional()
          .safeParse(frontmatter[key]);
        if (!parsed.success) {
          issues.push(
            ...parsed.error.issues.map((issue) => ({
              ...issue,
              path: [key, ...issue.path],
            })),
          );
          continue;
        }
        const values = parsed.data ?? [];
        if (!definition.multiple && values.length > 1)
          issues.push({
            code: "custom",
            path: [key],
            message: `${definition.label}: choose at most one value.`,
          });
        if (
          definition.values &&
          values.some((value) => !definition.values?.includes(value))
        )
          issues.push({
            code: "custom",
            path: [key],
            message: `${definition.label}: choose values from the configured list.`,
          });
      }
      if (issues.length) throw new z.ZodError(issues);
    });
  }
  return source;
}
