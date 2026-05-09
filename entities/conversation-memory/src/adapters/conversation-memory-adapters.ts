import { BaseEntityAdapter } from "@brains/plugins";
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

export class DecisionAdapter extends BaseEntityAdapter<
  DecisionEntity,
  DecisionMetadata
> {
  constructor() {
    super({
      entityType: DECISION_ENTITY_TYPE,
      schema: decisionSchema,
      frontmatterSchema: decisionMetadataSchema,
    });
  }

  public composeContent(
    title: string,
    text: string,
    metadata: DecisionMetadata,
  ): string {
    return this.buildMarkdown(
      [`# ${title}`, "", text.trim(), ""].join("\n"),
      metadata as Record<string, unknown>,
    );
  }

  public override toMarkdown(entity: DecisionEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<DecisionEntity> {
    return {
      entityType: DECISION_ENTITY_TYPE,
      content: markdown,
      metadata: this.parseFrontMatter(markdown, decisionMetadataSchema),
    };
  }

  public override extractMetadata(entity: DecisionEntity): DecisionMetadata {
    return entity.metadata;
  }
}

export class ActionItemAdapter extends BaseEntityAdapter<
  ActionItemEntity,
  ActionItemMetadata
> {
  constructor() {
    super({
      entityType: ACTION_ITEM_ENTITY_TYPE,
      schema: actionItemSchema,
      frontmatterSchema: actionItemMetadataSchema,
    });
  }

  public composeContent(
    title: string,
    text: string,
    metadata: ActionItemMetadata,
  ): string {
    return this.buildMarkdown(
      [`# ${title}`, "", text.trim(), ""].join("\n"),
      metadata as Record<string, unknown>,
    );
  }

  public override toMarkdown(entity: ActionItemEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<ActionItemEntity> {
    return {
      entityType: ACTION_ITEM_ENTITY_TYPE,
      content: markdown,
      metadata: this.parseFrontMatter(markdown, actionItemMetadataSchema),
    };
  }

  public override extractMetadata(
    entity: ActionItemEntity,
  ): ActionItemMetadata {
    return entity.metadata;
  }
}
