import type { ContentVisibility } from "@brains/sdk/entities";
import { readStoredGroupingVocabulary } from "./entity/grouping-vocabulary";
import {
  GROUPING_VOCABULARY_TYPE,
  type GroupingVocabularyFrontmatter,
} from "./grouping-vocabulary-contract";
import type { StudioRuntime } from "./runtime";

/** Uncached caller-scoped presentation read. Enforcement belongs to the SDK runtime. */
export async function readGroupingVocabularies(
  context: StudioRuntime,
  visibilityScope: ContentVisibility,
): Promise<GroupingVocabularyFrontmatter["groupings"]> {
  const entity = await context.entities.getEntity({
    entityType: GROUPING_VOCABULARY_TYPE,
    id: GROUPING_VOCABULARY_TYPE,
    visibilityScope,
  });
  return entity ? readStoredGroupingVocabulary(entity.content).groupings : {};
}
