import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/** The entity type that holds an edit made over a newer version. */
export const CONFLICT_ENTITY_TYPE = "conflict";

/**
 * The entity type that holds an image saved over a newer one. Image bytes
 * are kept as an asset, which only an entity that is nothing but its asset
 * can hold, so a losing image has a type of its own beside `conflict`.
 */
export const CONFLICT_IMAGE_ENTITY_TYPE = "conflict-image";

type ConflictOriginSchema = z.ZodEnum<{
  studio: "studio";
  drive: "drive";
  file: "file";
  git: "git";
}>;

/** The way in an edit came through. */
export const conflictOriginSchema: ConflictOriginSchema = z.enum([
  "studio",
  "drive",
  "file",
  "git",
]);

export type ConflictOrigin = z.output<typeof conflictOriginSchema>;

type ConflictVisibilitySchema = z.ZodEnum<{
  public: "public";
  shared: "shared";
  restricted: "restricted";
}>;

const visibilitySchema: ConflictVisibilitySchema = z.enum([
  "public",
  "shared",
  "restricted",
]);

type RecordConflictRequestSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  origin: ConflictOriginSchema;
  actor: z.ZodOptional<z.ZodString>;
  base: z.ZodOptional<z.ZodString>;
  current: z.ZodString;
  text: z.ZodString;
  image: z.ZodOptional<
    z.ZodObject<{
      bytes: z.ZodCustom<Uint8Array, Uint8Array>;
      metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }>
  >;
  targetVisibility: ConflictVisibilitySchema;
  declaredVisibility: z.ZodOptional<ConflictVisibilitySchema>;
}>;

/**
 * An edit that lost: made over a version of an entity that is no longer the
 * current one, and held nowhere but in this request.
 */
export const recordConflictRequestSchema: RecordConflictRequestSchema =
  z.object({
    /** The entity the edit was for. */
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    origin: conflictOriginSchema,
    /** The user id of whoever made the edit, when the way in knows one. */
    actor: z.string().min(1).optional(),
    /** The content hash the edit started from, when the way in recorded one. */
    base: z.string().min(1).optional(),
    /** The content hash of the version the edit would have replaced. */
    current: z.string().min(1),
    /** The losing file exactly as it arrived; empty for an image. */
    text: z.string(),
    /**
     * A losing image: its bytes, and what they are (format, dimensions) as
     * the way in read them. The request stays in the process it was made in.
     */
    image: z
      .object({
        bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
          message: "Image bytes must be a Uint8Array",
        }),
        metadata: z.record(z.string(), z.unknown()),
      })
      .optional(),
    /** The target's visibility now. */
    targetVisibility: visibilitySchema,
    /** The visibility the losing text names for itself, if it names one. */
    declaredVisibility: visibilitySchema.optional(),
  });

export type RecordConflictRequest = z.output<
  typeof recordConflictRequestSchema
>;

type RecordConflictResponseSchema = z.ZodObject<{
  conflictId: z.ZodString;
  created: z.ZodBoolean;
}>;

/** The conflict that now holds the edit; `created` is false when it already did. */
export const recordConflictResponseSchema: RecordConflictResponseSchema =
  z.object({
    conflictId: z.string().min(1),
    created: z.boolean(),
  });

export type RecordConflictResponse = z.output<
  typeof recordConflictResponseSchema
>;

/**
 * Hand a losing edit to whoever keeps conflicts, so it is in the Inbox and
 * not lost. A way in that cannot reach an owner must not drop the edit.
 */
export const recordConflictContract: BusContract<
  RecordConflictRequestSchema,
  RecordConflictResponseSchema,
  "request"
> = defineBusContract({
  channel: "conflict:record",
  request: recordConflictRequestSchema,
  response: recordConflictResponseSchema,
  delivery: "request",
});

type ConflictActionSchema = z.ZodEnum<{
  apply: "apply";
  "keep-current": "keep-current";
}>;

/** What can be done with a conflict: take the losing version, or leave it. */
export const conflictActionSchema: ConflictActionSchema = z.enum([
  "apply",
  "keep-current",
]);

type ResolveConflictRequestSchema = z.ZodObject<{
  conflictId: z.ZodString;
  action: ConflictActionSchema;
  userId: z.ZodString;
  permissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
}>;

/**
 * Settle a conflict outside the Inbox, as a person: the one whose edit it
 * holds, or an admin. Anyone else is refused.
 */
export const resolveConflictRequestSchema: ResolveConflictRequestSchema =
  z.object({
    conflictId: z.string().min(1),
    action: conflictActionSchema,
    /** Who is resolving it, as the way in authenticated them. */
    userId: z.string().min(1),
    permissionLevel: z.enum(["admin", "trusted", "public"]),
  });

export type ResolveConflictRequest = z.output<
  typeof resolveConflictRequestSchema
>;

type ResolveConflictResponseSchema = z.ZodObject<{
  resolved: z.ZodLiteral<true>;
}>;

export const resolveConflictResponseSchema: ResolveConflictResponseSchema =
  z.object({ resolved: z.literal(true) });

export const resolveConflictContract: BusContract<
  ResolveConflictRequestSchema,
  ResolveConflictResponseSchema,
  "request"
> = defineBusContract({
  channel: "conflict:resolve",
  request: resolveConflictRequestSchema,
  response: resolveConflictResponseSchema,
  delivery: "request",
});
