import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/*
 * Chat beside an open entry is about that entry. Web Chat stores which entry
 * a conversation is about as its context handoff, and asks Studio for the
 * entry on every turn, read with the asker's visibility. Studio answers null
 * for an entry the asker cannot read, or that does not exist, alike.
 */

/** The context handoff source a conversation about one entry carries. */
export const STUDIO_ENTRY_CONTEXT_SOURCE = "studio-entry";

const entityTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(100);

/**
 * The handoff item that names one entry: `<entityType>:<entityId>`. A type
 * never contains a colon, so the first colon divides them.
 */
export function studioEntryContextItemId(
  entityType: string,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

/** The entry a handoff item names, or null when it names none. */
export function parseStudioEntryContextItemId(
  itemId: string,
): { entityType: string; entityId: string } | null {
  const colon = itemId.indexOf(":");
  if (colon < 1) return null;
  const entityType = entityTypeSchema.safeParse(itemId.slice(0, colon));
  const entityId = itemId.slice(colon + 1);
  if (!entityType.success || entityId.length === 0) return null;
  return { entityType: entityType.data, entityId };
}

export const studioEntryContextRequestSchema: z.ZodObject<
  {
    entityType: z.ZodString;
    entityId: z.ZodString;
    visibilityScope: z.ZodEnum<{
      public: "public";
      shared: "shared";
      restricted: "restricted";
    }>;
  },
  z.core.$strict
> = z.strictObject({
  entityType: entityTypeSchema,
  entityId: z.string().min(1).max(300),
  /** The widest visibility the asker may read. */
  visibilityScope: z.enum(["public", "shared", "restricted"]),
});

const studioEntryFieldSchema: z.ZodObject<
  { name: z.ZodString; label: z.ZodString },
  z.core.$strict
> = z.strictObject({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
});

export const studioEntryContextResponseSchema: z.ZodNullable<
  z.ZodObject<
    {
      title: z.ZodString;
      typeLabel: z.ZodString;
      markdown: z.ZodString;
      fields: z.ZodArray<typeof studioEntryFieldSchema>;
    },
    z.core.$strict
  >
> = z
  .strictObject({
    title: z.string().max(500),
    /** The type's singular name, as Studio shows it ("post"). */
    typeLabel: z.string().min(1).max(100),
    /** The stored document, frontmatter included. */
    markdown: z.string(),
    /** The text fields an answer may propose a value for, body included. */
    fields: z.array(studioEntryFieldSchema).max(40),
  })
  .nullable();

export type StudioEntryContext = z.output<
  typeof studioEntryContextResponseSchema
>;

/** One entry, as Chat beside it reads it. */
export const studioEntryContextContract: BusContract<
  typeof studioEntryContextRequestSchema,
  typeof studioEntryContextResponseSchema,
  "request"
> = defineBusContract({
  channel: "studio:entry-context",
  request: studioEntryContextRequestSchema,
  response: studioEntryContextResponseSchema,
  delivery: "request",
});
