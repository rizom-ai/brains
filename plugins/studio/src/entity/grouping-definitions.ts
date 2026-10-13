import { BaseEntityAdapter, baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  GROUPING_DEFINITIONS_TYPE,
  groupingDefinitionsFrontmatterSchema,
  type GroupingDefinitionsFrontmatter,
} from "../grouping-definitions-contract";

type Metadata = Record<string, never>;
const metadataSchema: z.ZodType<Metadata> = z.object({});
export const groupingDefinitionsEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"grouping-definitions">;
    entityType: z.ZodLiteral<"grouping-definitions">;
    metadata: z.ZodType<Metadata>;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal(GROUPING_DEFINITIONS_TYPE),
  entityType: z.literal(GROUPING_DEFINITIONS_TYPE),
  metadata: metadataSchema,
});

type DefinitionsEntity = z.output<typeof groupingDefinitionsEntitySchema>;
class GroupingDefinitionsAdapter extends BaseEntityAdapter<
  DefinitionsEntity,
  Metadata,
  GroupingDefinitionsFrontmatter
> {
  constructor() {
    super({
      entityType: GROUPING_DEFINITIONS_TYPE,
      purpose:
        "Admin-authored grouping names, participating types, cardinality and optional allowed values.",
      schema: groupingDefinitionsEntitySchema,
      frontmatterSchema: groupingDefinitionsFrontmatterSchema,
      isSingleton: true,
      hasBody: false,
    });
  }

  /** Reconstruction must remain possible even when the document needs repair. */
  public fromMarkdown(content: string): Partial<DefinitionsEntity> {
    return {
      id: GROUPING_DEFINITIONS_TYPE,
      entityType: GROUPING_DEFINITIONS_TYPE,
      content,
      metadata: {},
    };
  }

  public read(content: string): GroupingDefinitionsFrontmatter {
    return groupingDefinitionsFrontmatterSchema.parse(
      parseMarkdown(content, { cache: false }).frontmatter,
    );
  }

  public override extractMetadata(_entity: DefinitionsEntity): Metadata {
    return {};
  }
}

export const groupingDefinitionsAdapter: GroupingDefinitionsAdapter =
  new GroupingDefinitionsAdapter();
