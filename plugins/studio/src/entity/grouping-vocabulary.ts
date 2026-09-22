import { BaseEntityAdapter, baseEntityParserSchema } from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
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

  /**
   * Reconstruction never validates. This document's whole purpose is to be
   * edited, so content an administrator must repair has to stay openable;
   * refusing to reconstruct it would leave no way to fix it in the app.
   * Writes are validated by this type's persist validator instead.
   */
  public fromMarkdown(content: string): Partial<VocabularyEntity> {
    return {
      id: GROUPING_VOCABULARY_TYPE,
      entityType: GROUPING_VOCABULARY_TYPE,
      content,
      metadata: {},
    };
  }

  /** Strict: the write path rejects a document it cannot parse. */
  public read(content: string): GroupingVocabularyFrontmatter {
    return this.parseFrontmatter(content);
  }

  /** Tolerant: malformed stored content declares no vocabularies at all. */
  public readStored(content: string): GroupingVocabularyFrontmatter {
    const parsed = groupingVocabularyFrontmatterSchema.safeParse(
      parseMarkdown(content).frontmatter,
    );
    return parsed.success ? parsed.data : { groupings: {} };
  }

  public override extractMetadata(_entity: VocabularyEntity): Metadata {
    return {};
  }
}

export const groupingVocabularyAdapter: GroupingVocabularyAdapter =
  new GroupingVocabularyAdapter();
