import {
  ENTITY_CHANNELS,
  actorRefSchema,
  defineChannel,
  type Channel,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "./types";

/*
 * The entity events every process of the runtime raises, declared here beside
 * the base entity schema their payload carries; @brains/contracts sits below
 * it. Their subscribers observe them or subscribe for execution: a plain
 * subscription hears one process only, so the messaging namespace refuses it.
 */

type EventEntitySchema = z.ZodObject<
  (typeof baseEntitySchema)["shape"],
  z.core.$loose
>;

/** The entity as it was written; an entity type's own top-level fields are kept. */
const eventEntitySchema: EventEntitySchema = baseEntitySchema.loose();

type EntityChangePayloadSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  entity: z.ZodOptional<EventEntitySchema>;
  previousMetadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  conversationId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  runId: z.ZodOptional<z.ZodString>;
  toolCallId: z.ZodOptional<z.ZodString>;
  actor: z.ZodOptional<typeof actorRefSchema>;
  interfaceType: z.ZodOptional<z.ZodString>;
}>;

/**
 * An entity was created, updated or deleted. A write carries the entity (the
 * prior one for a delete) and an update its previous metadata; a projection's
 * write names only the entity. The rest is the context of the mutation that
 * made the change, when it had one.
 */
export const entityChangePayloadSchema: EntityChangePayloadSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entity: eventEntitySchema.optional(),
  previousMetadata: z.record(z.string(), z.unknown()).optional(),
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  actor: actorRefSchema.optional(),
  interfaceType: z.string().optional(),
});

export type EntityChangePayload = z.output<typeof entityChangePayloadSchema>;

type EmbeddingReadyPayloadSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  entity: EventEntitySchema;
  restated: z.ZodOptional<z.ZodBoolean>;
}>;

/** An entity's embedding is stored, so it can be found by meaning. */
export const embeddingReadyPayloadSchema: EmbeddingReadyPayloadSchema =
  z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    entity: eventEntitySchema,
    // A quiet rewrite restated the entity: the embedding is fresh, the
    // entity was findable by meaning before.
    restated: z.boolean().optional(),
  });

export type EmbeddingReadyPayload = z.output<
  typeof embeddingReadyPayloadSchema
>;

export const entityCreatedChannel: Channel<
  EntityChangePayload,
  unknown,
  typeof ENTITY_CHANNELS.created
> = defineChannel(ENTITY_CHANNELS.created, entityChangePayloadSchema);

export const entityUpdatedChannel: Channel<
  EntityChangePayload,
  unknown,
  typeof ENTITY_CHANNELS.updated
> = defineChannel(ENTITY_CHANNELS.updated, entityChangePayloadSchema);

export const entityDeletedChannel: Channel<
  EntityChangePayload,
  unknown,
  typeof ENTITY_CHANNELS.deleted
> = defineChannel(ENTITY_CHANNELS.deleted, entityChangePayloadSchema);

type EntityRenamedPayloadSchema = z.ZodObject<
  EntityChangePayloadSchema["shape"] & { previousId: z.ZodString }
>;

/**
 * An entity has another id and is otherwise as it was. It was neither
 * deleted nor created: whatever follows an entity's life keeps following
 * this one under its new id.
 */
export const entityRenamedPayloadSchema: EntityRenamedPayloadSchema =
  entityChangePayloadSchema.extend({
    /** The id the entity had before; `entityId` is the one it has now. */
    previousId: z.string().min(1),
  });

export type EntityRenamedPayload = z.output<typeof entityRenamedPayloadSchema>;

export const entityRenamedChannel: Channel<
  EntityRenamedPayload,
  unknown,
  typeof ENTITY_CHANNELS.renamed
> = defineChannel(ENTITY_CHANNELS.renamed, entityRenamedPayloadSchema);

export const embeddingReadyChannel: Channel<
  EmbeddingReadyPayload,
  unknown,
  typeof ENTITY_CHANNELS.embeddingReady
> = defineChannel(ENTITY_CHANNELS.embeddingReady, embeddingReadyPayloadSchema);
