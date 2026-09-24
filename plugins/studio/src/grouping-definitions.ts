import {
  internalFullScope,
  type BaseEntity,
  type ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  groupingDefinitionsAdapter,
  groupingDefinitionsEntitySchema,
} from "./entity/grouping-definitions";
import { GROUPING_DEFINITIONS_TYPE } from "./grouping-definitions-contract";
import { GroupingDefinitionSource } from "./grouping-definition-source";

/** Install after contributor types register; this document is the only source. */
export function registerGroupingDefinitions(
  context: ServicePluginContext,
): GroupingDefinitionSource {
  context.entities.register(
    GROUPING_DEFINITIONS_TYPE,
    groupingDefinitionsEntitySchema,
    groupingDefinitionsAdapter,
    {
      embeddable: false,
      projectionSource: false,
      actionPolicy: {
        create: "admin",
        update: "admin",
        delete: "admin",
        publish: "never",
      },
    },
  );
  const source = new GroupingDefinitionSource({
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
    validate: (groupings): void =>
      context.entities.validateGroupings(groupings),
    replace: (groupings): void => context.entities.replaceGroupings(groupings),
  });
  context.entities.registerGroupingSource({
    entityType: GROUPING_DEFINITIONS_TYPE,
    ensureCurrent: () => source.ensureCurrent(),
  });
  context.entities.registerPersistValidator(
    GROUPING_DEFINITIONS_TYPE,
    async (entity) => {
      const { groupings } = groupingDefinitionsAdapter.read(entity.content);
      const issues: z.core.$ZodIssue[] = source
        .validateDefinitions(groupings)
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
    if (
      type === GROUPING_DEFINITIONS_TYPE ||
      !context.entities.getAdapter(type)?.frontmatterSchema ||
      context.entityService.getEntityTypeConfig(type).binaryStorage === "asset"
    )
      continue;
    context.entities.registerPersistValidator(type, async (entity) => {
      // The persistence boundary refreshed the source before projecting fields.
      // Read the authored values, never caller-supplied or stale row metadata.
      const definitions = Object.entries(source.getSnapshot().groupings).filter(
        ([, definition]) => definition.types.includes(type),
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
