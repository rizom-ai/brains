import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import {
  ACTION_ITEM_ENTITY_TYPE,
  ACTION_ITEM_RETIRED_FIELDS,
  ACTION_ITEM_TRANSLATED_FIELDS,
  actionItemBody,
  actionItemFrontmatter,
  actionItemMetadataSchema,
  actionItemStoredMetadataSchema,
} from "@brains/action-items";
import {
  DECISION_RETIRED_FIELDS,
  decisionMetadataSchema,
} from "./schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "./lib/constants";

/** An entry is named by its body heading; its id is a reference. */
function bodyHeading(content: string): string | undefined {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading !== undefined && heading.length > 0 ? heading : undefined;
}

/**
 * A decision recorded from a conversation: a heading and its text, its
 * frontmatter its metadata. A write keeps the header in the order of the
 * document it replaces, as the decision adapter wrote documents as given.
 */
export const decision: EntityDefinition<
  typeof DECISION_ENTITY_TYPE,
  typeof decisionMetadataSchema
> = writesInDocumentOrder(
  defineEntity({
    type: DECISION_ENTITY_TYPE,
    purpose: "A decision recorded from a conversation.",
    metadata: decisionMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => ({
        content: content.replace(/^\n+/u, ""),
        metadata: decisionMetadataSchema.parse(frontmatter),
      }),
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: decisionMetadataSchema.parse(metadata),
      }),
    },
    displayTitle: ({ content }) => bodyHeading(content),
    config: { retiredFields: [...DECISION_RETIRED_FIELDS] },
  }),
);

/** Every header field is read as stored; metadata parses its own. */
const actionItemHeader: z.ZodObject = z.looseObject({});

const storedActionItem = storedDocumentCodec<
  typeof actionItemHeader,
  typeof actionItemMetadataSchema
>({
  header: actionItemHeader,
  deriveMetadata: (header) => actionItemStoredMetadataSchema.parse(header),
  readAsWritten: true,
});
// A write states the owned fields from metadata, in their current shape,
// then every extension (a grouping) as the document states it, under the
// card's body, as the action-item adapter wrote every card. The codec stays
// the one storedDocumentCodec made, which is what reads as written.
type ActionItemCodec = typeof storedActionItem;
Object.assign(storedActionItem, {
  encode: ({
    content,
    metadata,
  }: Parameters<NonNullable<ActionItemCodec["encode"]>>[0]): ReturnType<
    NonNullable<ActionItemCodec["encode"]>
  > => ({
    content: actionItemBody(content),
    frontmatter: actionItemFrontmatter({
      content,
      metadata: actionItemStoredMetadataSchema.parse(metadata),
    }),
  }),
});

/**
 * An action item captured from a conversation, an Inbox item or the board.
 * Read as its stored document, as the action-item adapter read it: the
 * board, its writers and its ownership rule read a card's header, its
 * extensions (groupings) among it, from its content. A card stored before
 * the trim reads in the current shape and is written in it.
 */
export const actionItem: EntityDefinition<
  typeof ACTION_ITEM_ENTITY_TYPE,
  typeof actionItemMetadataSchema
> = defineEntity({
  type: ACTION_ITEM_ENTITY_TYPE,
  purpose: "An action item captured from a conversation.",
  metadata: actionItemMetadataSchema,
  markdown: storedActionItem,
  // A card is named by its text; one with no heading by its id.
  displayTitle: ({ content }) => {
    const title = bodyHeading(content)?.replace(/^Action item:\s*/, "");
    return title === "" ? undefined : title;
  },
  config: {
    retiredFields: [...ACTION_ITEM_RETIRED_FIELDS],
    translatedFields: [...ACTION_ITEM_TRANSLATED_FIELDS],
    // A card is only whole with its origin, capture time and status, which
    // only the action-item writers set: never system_create.
    actionPolicy: { create: "never" },
  },
});
