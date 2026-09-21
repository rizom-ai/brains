import type { ContentVisibility, ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  groupingVocabularyAdapter,
  groupingVocabularyEntitySchema,
} from "./entity/grouping-vocabulary";
import {
  GROUPING_VOCABULARY_TYPE,
  type GroupingVocabularyFrontmatter,
} from "./grouping-vocabulary-contract";

/** No cache: workers and imports must observe the current policy as well. */
export async function readGroupingVocabularies(
  context: ServicePluginContext,
  visibilityScope: ContentVisibility,
): Promise<GroupingVocabularyFrontmatter["groupings"]> {
  const entity = await context.entityService.getEntity({
    entityType: GROUPING_VOCABULARY_TYPE,
    id: GROUPING_VOCABULARY_TYPE,
    visibilityScope,
  });
  return entity ? groupingVocabularyAdapter.read(entity.content).groupings : {};
}

export function registerGroupingVocabulary(
  context: ServicePluginContext,
): void {
  context.entities.register(
    GROUPING_VOCABULARY_TYPE,
    groupingVocabularyEntitySchema,
    groupingVocabularyAdapter,
    { embeddable: false, projectionSource: false },
  );
  context.entities.registerPersistValidator(
    GROUPING_VOCABULARY_TYPE,
    async (entity) => {
      const { groupings } = groupingVocabularyAdapter.read(entity.content);
      const declared = new Set(
        context.entities.getGroupings().map((grouping) => grouping.key),
      );
      const issues: z.core.$ZodIssue[] = [];
      for (const key of Object.keys(groupings)) {
        if (!declared.has(key))
          issues.push({
            code: "custom",
            path: ["groupings", key],
            message: `Unknown grouping: ${key}`,
          });
      }
      if (entity.visibility === "public")
        issues.push({
          code: "custom",
          path: ["visibility"],
          message:
            "Grouping vocabularies must not be public. Use shared visibility for trusted editors.",
        });
      if (issues.length) throw new z.ZodError(issues);
    },
  );
}

export function registerGroupingVocabularyValidators(
  context: ServicePluginContext,
): void {
  const declarations = context.entities.getGroupings();
  const types = new Set(declarations.flatMap((grouping) => grouping.types));
  for (const type of types) {
    const groupings = declarations.filter((grouping) =>
      grouping.types.includes(type),
    );
    context.entities.registerPersistValidator(type, async (entity) => {
      const vocabularies = await readGroupingVocabularies(
        context,
        "restricted",
      );
      const issues: z.core.$ZodIssue[] = [];
      for (const grouping of groupings) {
        const vocabulary = Object.hasOwn(vocabularies, grouping.key)
          ? vocabularies[grouping.key]
          : undefined;
        if (!vocabulary) continue;
        // The entity registry has already validated and projected these exact
        // values from source. Never accept caller metadata as membership.
        const values =
          z
            .array(z.string())
            .optional()
            .parse(entity.metadata[grouping.field]) ?? [];
        if (values.some((value) => !vocabulary.values.includes(value)))
          issues.push({
            code: "custom",
            path: [grouping.field],
            message: `${grouping.label}: choose values from the configured list.`,
          });
        if (!vocabulary.multiple && values.length > 1)
          issues.push({
            code: "custom",
            path: [grouping.field],
            message: `${grouping.label}: choose at most one value.`,
          });
      }
      if (issues.length) throw new z.ZodError(issues);
    });
  }
}
