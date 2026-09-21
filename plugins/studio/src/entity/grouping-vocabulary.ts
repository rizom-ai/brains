import { BaseEntityAdapter, baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

import {
  GROUPING_VOCABULARY_TYPE,
  groupingVocabularyFrontmatterSchema,
  type GroupingVocabularyFrontmatter,
} from "../grouping-vocabulary-contract";
type Metadata = Record<string, never>;
const metadataSchema: z.ZodType<Metadata> = z.object({});

export const groupingVocabularyEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"grouping-vocabulary">;
    entityType: z.ZodLiteral<"grouping-vocabulary">;
    metadata: z.ZodType<Metadata>;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal(GROUPING_VOCABULARY_TYPE),
  entityType: z.literal(GROUPING_VOCABULARY_TYPE),
  metadata: metadataSchema,
});

type VocabularyEntity = z.output<typeof groupingVocabularyEntitySchema>;

class GroupingVocabularyAdapter extends BaseEntityAdapter<
  VocabularyEntity,
  Metadata,
  GroupingVocabularyFrontmatter
> {
  constructor() {
    super({
      entityType: GROUPING_VOCABULARY_TYPE,
      purpose:
        "Admin-authored allowed values and cardinality for Studio groupings.",
      schema: groupingVocabularyEntitySchema,
      frontmatterSchema: groupingVocabularyFrontmatterSchema,
      isSingleton: true,
      hasBody: false,
    });
  }

  public fromMarkdown(content: string): Partial<VocabularyEntity> {
    this.parseFrontmatter(content);
    return {
      id: GROUPING_VOCABULARY_TYPE,
      entityType: GROUPING_VOCABULARY_TYPE,
      content,
      metadata: {},
    };
  }

  public read(content: string): GroupingVocabularyFrontmatter {
    return this.parseFrontmatter(content);
  }

  public override extractMetadata(_entity: VocabularyEntity): Metadata {
    return {};
  }
}

export const groupingVocabularyAdapter: GroupingVocabularyAdapter =
  new GroupingVocabularyAdapter();
