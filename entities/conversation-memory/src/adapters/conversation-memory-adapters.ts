import { BaseEntityAdapter } from "@brains/plugins";
import type {
  BaseEntity,
  BaseEntityFrontmatterSchema,
  EntitySchemaParser,
} from "@brains/plugins";
import { z as z4 } from "@brains/utils/zod-v4";
import {
  actionItemMetadataSchema,
  actionItemSchema,
  decisionMetadataSchema,
  decisionSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
  type DecisionEntity,
  type DecisionMetadata,
} from "../schemas/conversation-memory";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
} from "../lib/constants";

const frontmatterRecordSchema = z4.record(z4.string(), z4.unknown());

interface TypedFrontmatterSchema<T> {
  parse(data: unknown): T;
}

/**
 * Shared adapter for derived conversation memory entities (decisions,
 * action items). Both entity types share an identical markdown shape:
 * the body is a single H1 title followed by free text, with metadata
 * persisted as YAML frontmatter.
 */
class ConversationMemoryEntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata extends object,
> extends BaseEntityAdapter<TEntity, TMetadata, Record<string, unknown>> {
  private readonly metadataSchema: { parse(data: unknown): TMetadata };

  constructor(config: {
    entityType: string;
    schema: EntitySchemaParser<TEntity>;
    metadataSchema: BaseEntityFrontmatterSchema<Record<string, unknown>>;
    parseMetadata: TypedFrontmatterSchema<TMetadata>;
  }) {
    super({
      entityType: config.entityType,
      schema: config.schema,
      frontmatterSchema: config.metadataSchema,
    });
    this.metadataSchema = config.parseMetadata;
  }

  public composeContent(
    title: string,
    text: string,
    metadata: TMetadata,
  ): string {
    return this.buildMarkdown(
      [`# ${title}`, "", text.trim(), ""].join("\n"),
      frontmatterRecordSchema.parse(metadata),
    );
  }

  public override toMarkdown(entity: TEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<TEntity> {
    return {
      entityType: this.entityType,
      content: markdown,
      metadata: this.parseFrontMatter(markdown, this.metadataSchema),
    } as Partial<TEntity>;
  }
}

export class DecisionAdapter extends ConversationMemoryEntityAdapter<
  DecisionEntity,
  DecisionMetadata
> {
  constructor() {
    super({
      entityType: DECISION_ENTITY_TYPE,
      schema: decisionSchema,
      metadataSchema: decisionMetadataSchema,
      parseMetadata: decisionMetadataSchema,
    });
  }
}

export class ActionItemAdapter extends ConversationMemoryEntityAdapter<
  ActionItemEntity,
  ActionItemMetadata
> {
  constructor() {
    super({
      entityType: ACTION_ITEM_ENTITY_TYPE,
      schema: actionItemSchema,
      metadataSchema: actionItemMetadataSchema,
      parseMetadata: actionItemMetadataSchema,
    });
  }
}
