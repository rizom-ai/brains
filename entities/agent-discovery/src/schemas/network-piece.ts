import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * A network piece: another brain's published record, kept in this brain for
 * answering visitors. Public, searchable and citable to its brain; never a
 * site page of this brain, never re-published, read-only. The owner of the
 * origin brain keeps control: withdrawing the record withdraws the piece at
 * the next sync.
 */
export const NETWORK_PIECE_ENTITY_TYPE = "network-piece" as const;

/** The projected record collections a brain publishes, by the kind a piece is filed under. */
export const NETWORK_PIECE_COLLECTIONS: Readonly<
  Record<NetworkPieceKind, string>
> = {
  post: "ai.rizom.brain.post",
  deck: "ai.rizom.brain.deck",
  project: "ai.rizom.brain.project",
  note: "ai.rizom.brain.note",
  link: "ai.rizom.brain.link",
  series: "ai.rizom.brain.series",
  topic: "ai.rizom.brain.topic",
  "social-post": "ai.rizom.brain.socialPost",
};

export const networkPieceKindSchema: z.ZodEnum<{
  post: "post";
  deck: "deck";
  project: "project";
  note: "note";
  link: "link";
  series: "series";
  topic: "topic";
  "social-post": "social-post";
}> = z.enum([
  "post",
  "deck",
  "project",
  "note",
  "link",
  "series",
  "topic",
  "social-post",
]);
export type NetworkPieceKind = z.output<typeof networkPieceKindSchema>;

/** The brain a piece came from, as the directory knows it. */
export const networkPieceBrainSchema: z.ZodObject<{
  did: z.ZodString;
  name: z.ZodString;
  url: z.ZodString;
}> = z.object({
  did: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
});

export const networkPieceMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  kind: typeof networkPieceKindSchema;
  status: z.ZodLiteral<"published">;
  brain: typeof networkPieceBrainSchema;
  origin: z.ZodString;
  collection: z.ZodString;
  rkey: z.ZodString;
  cid: z.ZodString;
  recordedAt: z.ZodString;
  excerpt: z.ZodString;
}> = z.object({
  title: z.string().min(1),
  kind: networkPieceKindSchema,
  // A piece exists only while its record is published; the status is the
  // publish gate a visitor's answer checks.
  status: z.literal("published"),
  brain: networkPieceBrainSchema,
  /** Where the piece lives: the record's own address, or its brain's site. */
  origin: z.string().url(),
  collection: z.string().min(1),
  rkey: z.string().min(1),
  cid: z.string().min(1),
  recordedAt: z.string().min(1),
  /** The record's opening words, for the source row. */
  excerpt: z.string(),
});
export type NetworkPieceMetadata = z.output<typeof networkPieceMetadataSchema>;

export const networkPieceFrontmatterSchema: typeof networkPieceMetadataSchema =
  networkPieceMetadataSchema;

export const networkPieceSchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<typeof NETWORK_PIECE_ENTITY_TYPE>;
    metadata: typeof networkPieceMetadataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal(NETWORK_PIECE_ENTITY_TYPE),
  metadata: networkPieceMetadataSchema,
});
export type NetworkPieceEntity = z.output<typeof networkPieceSchema>;
