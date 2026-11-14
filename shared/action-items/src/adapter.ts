import {
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseTypedFrontmatter,
  type EntityAdapter,
} from "@brains/sdk/internal/entity-runtime";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  actionItemBody,
  actionItemFrontmatter,
  actionItemTitle,
} from "./board";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import {
  actionItemMetadataSchema,
  actionItemStoredMetadataSchema,
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "./schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/** The action-item adapter, and how a new card's document is composed. */
export interface ActionItemAdapter extends EntityAdapter<
  ActionItemEntity,
  ActionItemMetadata
> {
  /** A card is named by its text; its id is a reference. */
  displayTitle(entity: ActionItemEntity): string;
  /** A card's first document: its H1 title, its text, its metadata. */
  composeContent(
    title: string,
    text: string,
    metadata: ActionItemMetadata,
  ): string;
}

/**
 * How an action item is written and read: its frontmatter carries the
 * card's fields, its body the text under one H1 title. Writing renders the
 * current shape, so any save migrates a card stored in an older one.
 */
export const actionItemAdapter: ActionItemAdapter = Object.freeze({
  entityType: ACTION_ITEM_ENTITY_TYPE,
  purpose: "An action item captured from a conversation.",
  schema: actionItemSchema,
  frontmatterSchema: actionItemMetadataSchema,
  toMarkdown: (entity: ActionItemEntity): string =>
    generateMarkdown(
      actionItemFrontmatter(entity),
      actionItemBody(entity.content),
    ),
  fromMarkdown: (markdown: string): Partial<ActionItemEntity> => ({
    entityType: ACTION_ITEM_ENTITY_TYPE,
    content: markdown,
    metadata: parseTypedFrontmatter(
      ACTION_ITEM_ENTITY_TYPE,
      markdown,
      actionItemStoredMetadataSchema,
    ),
  }),
  extractMetadata: (entity: ActionItemEntity): ActionItemMetadata =>
    entity.metadata,
  parseFrontMatter: <T>(
    markdown: string,
    schema: { parse(data: unknown): T },
  ): T => parseTypedFrontmatter(ACTION_ITEM_ENTITY_TYPE, markdown, schema),
  generateFrontMatter: (entity: ActionItemEntity): string =>
    generateFrontmatter(frontmatterRecordSchema.parse(entity.metadata)),
  getBodyTemplate: (): string => "",
  displayTitle: (entity: ActionItemEntity): string => actionItemTitle(entity),
  composeContent: (
    title: string,
    text: string,
    metadata: ActionItemMetadata,
  ): string =>
    generateMarkdownWithFrontmatter(
      [`# ${title}`, "", text.trim(), ""].join("\n"),
      frontmatterRecordSchema.parse(metadata),
    ),
});
