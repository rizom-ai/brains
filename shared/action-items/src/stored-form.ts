import { isRecord } from "@brains/utils/is-record";
import { z } from "@brains/utils/zod";
import {
  isActorRefText,
  peopleFromIndex,
  peopleIndex,
  peopleSection,
  splitPeopleSection,
  type StoredPerson,
} from "./people-section";
import { actionItemMetadataSchema } from "./schema";

/**
 * An action item's next stored form (docs/external-plugin-authoring.md, The stored format): its
 * Inbox source as sourceRef, sourceEntityType and sourceEntityId, and its
 * people indexed as actor refs, every header key an Obsidian property;
 * each person stated whole in a People section closing the body.
 */

/** The people a card names, each list under its heading. */
export const ACTION_ITEM_PEOPLE = [
  { key: "assignedTo", label: "Assigned to" },
  { key: "requestedBy", label: "Requested by" },
] as const;

/** Header keys only the next form writes; the card's own, never extensions. */
export const ACTION_ITEM_NEXT_FORM_FIELDS: readonly string[] = [
  "sourceEntityType",
  "sourceEntityId",
  "assignedToAliases",
  "requestedByAliases",
];

/** Header keys that stand for one another across the forms, one place each. */
export const ACTION_ITEM_PLACES: readonly (readonly string[])[] = [
  ["sourceRef", "sourceEntityType", "sourceEntityId"],
  ["assignedTo", "assignedToAliases"],
  ["requestedBy", "requestedByAliases"],
];

const provenance = { studioWidget: "provenance" } as const;
const hidden = { studioWidget: "hidden" } as const;

/** The next form's header, as Studio and the Obsidian vault present it. */
export const actionItemNextHeaderSchema: z.ZodObject = z.object({
  ...Object.fromEntries(
    Object.entries(actionItemMetadataSchema.shape).filter(
      ([key]) => !["sourceRef", "assignedTo", "requestedBy"].includes(key),
    ),
  ),
  sourceRef: z.string().min(1).optional().meta(provenance),
  sourceEntityType: z.string().min(1).optional().meta(provenance),
  sourceEntityId: z.string().min(1).optional().meta(provenance),
  assignedTo: z.array(z.string()).optional().meta({ studioWidget: "members" }),
  assignedToAliases: z.array(z.string()).optional().meta(hidden),
  requestedBy: z.array(z.string()).optional().meta({ studioWidget: "people" }),
  requestedByAliases: z.array(z.string()).optional().meta(hidden),
});

/** A card's body read past its People section: what every reader reads. */
export function bodyAbovePeople(body: string): string {
  return splitPeopleSection(body, ACTION_ITEM_PEOPLE).body;
}

const personSchema = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

function storedPersonOf(person: z.output<typeof personSchema>): StoredPerson {
  return {
    ...(person.id !== undefined && { ref: person.id }),
    ...(person.name !== undefined && { name: person.name }),
    ...(person.aliases &&
      person.aliases.length > 0 && { aliases: person.aliases }),
  };
}

function cardPersonOf(person: StoredPerson): Record<string, unknown> {
  return {
    ...(person.name !== undefined && { name: person.name }),
    ...(person.ref !== undefined && { id: person.ref }),
    ...(person.aliases &&
      person.aliases.length > 0 && { aliases: [...person.aliases] }),
  };
}

/**
 * A stored document in either form, its header in the current shape, as
 * the card's metadata reads it: a next-form source gathered into one
 * object, and its people read from the header's index and the People
 * section. A document in the current form is as it was.
 */
export function inCurrentShape(document: {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}): { content: string; frontmatter: Record<string, unknown> } {
  const { sourceEntityType, sourceEntityId, ...header } = document.frontmatter;
  const split = splitPeopleSection(document.content, ACTION_ITEM_PEOPLE);
  const people = Object.fromEntries(
    ACTION_ITEM_PEOPLE.flatMap(({ key }) => {
      const indexed = header[key];
      const refs =
        Array.isArray(indexed) && indexed.every(isActorRefText)
          ? indexed
          : undefined;
      if (indexed !== undefined && refs === undefined) return [];
      const read = peopleFromIndex(split.people[key], refs);
      return read ? [[key, read.map(cardPersonOf)]] : [];
    }),
  );
  const source = header["sourceRef"];
  return {
    content: split.body,
    frontmatter: {
      ...Object.fromEntries(
        Object.entries(header).filter(
          ([key]) => !ACTION_ITEM_NEXT_FORM_FIELDS.includes(key),
        ),
      ),
      ...(typeof source === "string" && {
        sourceRef: {
          sourceId: source,
          entityType: sourceEntityType,
          entityId: sourceEntityId,
        },
      }),
      ...people,
    },
  };
}

/**
 * A card's next-form header and body, from the header and body of the
 * current shape a write states.
 */
export function inNextForm(document: {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}): { content: string; frontmatter: Record<string, unknown> } {
  const lists = ACTION_ITEM_PEOPLE.map((list) => ({
    ...list,
    people: z
      .array(personSchema)
      .catch([])
      .parse(document.frontmatter[list.key] ?? [])
      .map(storedPersonOf),
  }));
  const section = peopleSection(lists);
  const source = document.frontmatter["sourceRef"];
  const header = Object.fromEntries(
    Object.entries(document.frontmatter).flatMap(([key, value]) => {
      if (key === "sourceRef" && isRecord(source))
        return [
          ["sourceRef", source["sourceId"]],
          ["sourceEntityType", source["entityType"]],
          ["sourceEntityId", source["entityId"]],
        ];
      const list = lists.find((held) => held.key === key);
      return list
        ? Object.entries(peopleIndex(list.key, list.people))
        : [[key, value]];
    }),
  );
  return {
    content:
      section.length === 0
        ? document.content
        : `${document.content.replace(/\n+$/u, "")}\n\n${section}\n`,
    frontmatter: header,
  };
}
