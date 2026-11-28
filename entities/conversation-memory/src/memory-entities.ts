import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  storedFormCodec,
} from "@brains/sdk/internal/entity-runtime";
import {
  ACTION_ITEM_ENTITY_TYPE,
  ACTION_ITEM_PLACES,
  ACTION_ITEM_RETIRED_FIELDS,
  ACTION_ITEM_TRANSLATED_FIELDS,
  actionItemBody,
  actionItemFrontmatter,
  actionItemMetadataSchema,
  actionItemNextHeaderSchema,
  actionItemStoredMetadataSchema,
  inCurrentShape,
  inNextForm,
} from "@brains/action-items";
import {
  DECISION_RETIRED_FIELDS,
  decisionMetadataSchema,
  insightMetadataSchema,
} from "./schemas/conversation-memory";
import { DECISION_ENTITY_TYPE, INSIGHT_ENTITY_TYPE } from "./lib/constants";
import { decisionCreateRoutes, insightCreateRoutes } from "./lib/memory-create";
import { memoryCodec } from "./lib/memory-codec";

/** An entry is named by its body heading; its id is a reference. */
function bodyHeading(content: string): string | undefined {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading !== undefined && heading.length > 0 ? heading : undefined;
}

const DECISION_INSTRUCTIONS =
  "Record a decision when someone asks to note what was decided: its title is the decision in a few words, its content what was decided. State its visibility as shared for a team's decision or restricted for a private one; a decision is never public.";

/**
 * A decision picked up from a conversation or recorded by hand: a heading
 * and its text, its frontmatter its metadata. A write keeps the header in the order of the
 * document it replaces, as the decision adapter wrote documents as given.
 * Its next form states the time range as startedAt and endedAt and its
 * people as actor refs, each person whole in the body's People section;
 * it reads either form and writes the one its store writes.
 */
export const decision: EntityDefinition<
  typeof DECISION_ENTITY_TYPE,
  typeof decisionMetadataSchema
> = defineEntity({
  type: DECISION_ENTITY_TYPE,
  purpose: "A decision a conversation settled, or one recorded by hand.",
  instructions: DECISION_INSTRUCTIONS,
  create: decisionCreateRoutes,
  metadata: decisionMetadataSchema,
  markdown: memoryCodec({
    schema: decisionMetadataSchema,
    people: [
      { key: "decidedBy", label: "Decided by" },
      { key: "mentionedBy", label: "Mentioned by" },
    ],
    body: (content) => content,
  }),
  displayTitle: ({ content }) => bodyHeading(content),
  config: { retiredFields: [...DECISION_RETIRED_FIELDS] },
});

const INSIGHT_INSTRUCTIONS =
  "Record an insight when someone asks to note what was learned or concluded: its title is the finding in a few words, its content what was found and why it holds. State its visibility as shared for a team's insight or restricted for a private one; an insight is never public. Work to be done is an action item and a choice the group settled is a decision, not an insight.";

/**
 * An insight picked up from a conversation or recorded by hand: what the
 * conversation learned or concluded, a heading and its text, its
 * frontmatter its metadata, with its people whole in the body's People
 * section, as a decision's are.
 */
export const insight: EntityDefinition<
  typeof INSIGHT_ENTITY_TYPE,
  typeof insightMetadataSchema
> = defineEntity({
  type: INSIGHT_ENTITY_TYPE,
  purpose: "What a conversation learned or concluded, or one recorded by hand.",
  instructions: INSIGHT_INSTRUCTIONS,
  create: insightCreateRoutes,
  metadata: insightMetadataSchema,
  markdown: memoryCodec({
    schema: insightMetadataSchema,
    people: [
      { key: "statedBy", label: "Stated by" },
      { key: "mentionedBy", label: "Mentioned by" },
    ],
    body: (content) => content,
  }),
  displayTitle: ({ content }) => bodyHeading(content),
});

/** Every header field is read as stored; metadata parses its own. */
const actionItemHeader: z.ZodObject = z.looseObject({});

const storedActionItem = storedDocumentCodec<
  typeof actionItemHeader,
  typeof actionItemMetadataSchema
>({
  header: actionItemHeader,
  // A card in the next form reads in the current shape.
  prepare: inCurrentShape,
  deriveMetadata: (header) => actionItemStoredMetadataSchema.parse(header),
});

/**
 * A write states the owned fields from metadata, in their current shape,
 * then every extension (a grouping) as the document states it, under the
 * card's body, as the action-item adapter wrote every card.
 */
function currentForm({
  content,
  metadata,
}: {
  content: string;
  metadata: z.input<typeof actionItemMetadataSchema>;
}): { content: string; frontmatter: Record<string, unknown> } {
  return {
    content: actionItemBody(content),
    frontmatter: actionItemFrontmatter({
      content,
      metadata: actionItemStoredMetadataSchema.parse(metadata),
    }),
  };
}

/**
 * Either stored form reads, as the card's stored document; the new form is
 * written. It states the card's Inbox source and people as flat keys, each
 * person whole in a People section closing the body.
 */
const actionItemMarkdown = storedFormCodec<typeof actionItemMetadataSchema>({
  decode: storedActionItem.decode,
  encode: (document) => inNextForm(currentForm(document)),
  header: actionItemNextHeaderSchema,
  oldHeader: actionItemMetadataSchema,
  places: ACTION_ITEM_PLACES,
  readAsWritten: true,
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
  markdown: actionItemMarkdown,
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
