import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/*
 * A collection whose membership the brain works out, such as a topic, is
 * answered by the plugin that owns it: membership a person chooses is a
 * group on the member instead, which Studio reads itself. Studio asks every
 * plugin, so each answers only for its own types.
 */

type CollectionTypesRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

export const collectionTypesRequestSchema: CollectionTypesRequestSchema =
  z.strictObject({});

const entityTypeSchema = z.string().trim().min(1).max(100);

export const collectionTypesResponseSchema: z.ZodObject<
  { types: z.ZodArray<z.ZodString> },
  z.core.$strict
> = z.strictObject({ types: z.array(entityTypeSchema).max(20) });

/** Which entity types a plugin answers members for. */
export const collectionTypesContract: BusContract<
  CollectionTypesRequestSchema,
  typeof collectionTypesResponseSchema,
  "collect"
> = defineBusContract({
  channel: "collections:types",
  request: collectionTypesRequestSchema,
  response: collectionTypesResponseSchema,
  delivery: "collect",
});

export const collectionMembersRequestSchema: z.ZodObject<
  {
    entityType: z.ZodString;
    ids: z.ZodArray<z.ZodString>;
    visibilityScope: z.ZodEnum<{
      public: "public";
      shared: "shared";
      restricted: "restricted";
    }>;
  },
  z.core.$strict
> = z.strictObject({
  entityType: entityTypeSchema,
  /** The collections asked about: one opened entry, or a page of rows. */
  ids: z.array(z.string().min(1).max(500)).min(1).max(200),
  /** The widest visibility the asker may read; members beyond it are left out. */
  visibilityScope: z.enum(["public", "shared", "restricted"]),
});

const memberRefSchema: z.ZodObject<
  { entityType: z.ZodString; id: z.ZodString },
  z.core.$strict
> = z.strictObject({
  entityType: entityTypeSchema,
  id: z.string().min(1).max(500),
});

export const collectionMembersResponseSchema: z.ZodObject<
  {
    collections: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          members: z.ZodArray<typeof memberRefSchema>;
        },
        z.core.$strict
      >
    >;
  },
  z.core.$strict
> = z.strictObject({
  /** Empty when the plugin does not own the type asked about. */
  collections: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(500),
        members: z.array(memberRefSchema).max(1000),
      }),
    )
    .max(200),
});

/** The members of some collections of one type, by collection id. */
export const collectionMembersContract: BusContract<
  typeof collectionMembersRequestSchema,
  typeof collectionMembersResponseSchema,
  "collect"
> = defineBusContract({
  channel: "collections:members",
  request: collectionMembersRequestSchema,
  response: collectionMembersResponseSchema,
  delivery: "collect",
});
