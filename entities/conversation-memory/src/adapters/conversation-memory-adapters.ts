import { BaseEntityAdapter } from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { z } from "@brains/utils";
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

/**
 * Shared adapter for derived conversation memory entities (decisions,
 * action items). Both entity types share an identical markdown shape:
 * the body is a single H1 title followed by free text, with metadata
 * persisted as YAML frontmatter.
 */
class ConversationMemoryEntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata extends object,
> extends BaseEntityAdapter<TEntity, TMetadata> {
  private readonly metadataSchema: z.ZodSchema<TMetadata>;

  constructor(config: {
    entityType: string;
    purpose: string;
    schema: z.ZodType<TEntity, z.ZodTypeDef, unknown>;
    metadataSchema: z.ZodObject<z.ZodRawShape>;
  }) {
    super({
      entityType: config.entityType,
      purpose: config.purpose,
      schema: config.schema,
      frontmatterSchema: config.metadataSchema,
    });
    this.metadataSchema =
      config.metadataSchema as unknown as z.ZodSchema<TMetadata>;
  }

  public composeContent(
    title: string,
    text: string,
    metadata: TMetadata,
  ): string {
    return this.buildMarkdown(
      [`# ${title}`, "", text.trim(), ""].join("\n"),
      metadata as Record<string, unknown>,
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
      purpose: "A decision recorded from a conversation.",
      schema: decisionSchema,
      metadataSchema: decisionMetadataSchema,
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
      purpose: "An action item captured from a conversation.",
      schema: actionItemSchema,
      metadataSchema: actionItemMetadataSchema,
    });
  }
}
