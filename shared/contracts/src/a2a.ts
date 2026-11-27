import { z } from "@brains/utils/zod";
import { actorRefSchema } from "./actor-ref";
import { SourceCitationSchema } from "./agent-response";
import { defineBusContract, type BusContract } from "./bus-contract";
import { defineChannel, type Channel } from "./channel";

type A2APeerAnswerSchema = z.ZodObject<{
  state: z.ZodString;
  response: z.ZodString;
  sources: z.ZodArray<typeof SourceCitationSchema>;
}>;

/** What a peer's answer gives the asking brain: its text and its citations. */
export const a2aPeerAnswerSchema: A2APeerAnswerSchema = z.object({
  state: z.string(),
  response: z.string(),
  sources: z.array(SourceCitationSchema),
});

export type A2APeerAnswer = z.output<typeof a2aPeerAnswerSchema>;

type A2AAskRequestSchema = z.ZodObject<{
  agent: z.ZodString;
  question: z.ZodString;
}>;

export const a2aAskRequestSchema: A2AAskRequestSchema = z.object({
  agent: z.string().trim().min(1).max(253),
  question: z.string().trim().min(1).max(4_000),
});

/**
 * Ask one saved, approved peer a question within the network-ask budget. The
 * request carries no level, so only peers saved public are asked. The A2A
 * interface owns it; a peer that does not complete its answer is a failure
 * with the reason.
 */
export const a2aAskContract: BusContract<
  A2AAskRequestSchema,
  A2APeerAnswerSchema,
  "request"
> = defineBusContract({
  channel: "a2a:ask:request",
  request: a2aAskRequestSchema,
  response: a2aPeerAnswerSchema,
  delivery: "request",
});

type A2ATurnRequestSchema = z.ZodObject<{
  agent: z.ZodString;
  message: z.ZodString;
}>;

export const a2aTurnRequestSchema: A2ATurnRequestSchema = z.object({
  agent: z.string().trim().min(1).max(253),
  message: z.string().trim().min(1).max(32_000),
});

/**
 * Put one turn of an exchange to a saved, approved peer, within the turn
 * budget. Unlike an ask, the message reaches the peer as written and may
 * carry what other peers answered, so it is longer than a question and says
 * itself what kind of answer it wants. Like an ask it carries no level, so
 * only peers saved public are reached, and a peer that does not complete its
 * answer is a failure with the reason.
 */
export const a2aTurnContract: BusContract<
  A2ATurnRequestSchema,
  A2APeerAnswerSchema,
  "request"
> = defineBusContract({
  channel: "a2a:turn:request",
  request: a2aTurnRequestSchema,
  response: a2aPeerAnswerSchema,
  delivery: "request",
});

type A2AAgentsRequestSchema = z.ZodObject<{
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  actor: z.ZodOptional<typeof actorRefSchema>;
  interfaceType: z.ZodOptional<z.ZodString>;
  userPermissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
}>;

/**
 * The entity and person a Studio call is about, carried for the record, and
 * the author's level: the saved agents listed and called are the ones it can
 * see.
 */
export const a2aAgentsRequestSchema: A2AAgentsRequestSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actor: actorRefSchema.optional(),
  interfaceType: z.string().optional(),
  userPermissionLevel: z.enum(["admin", "trusted", "public"]),
});

type A2ACallRequestSchema = z.ZodObject<
  {
    agent: z.ZodString;
    instruction: z.ZodString;
    selection: z.ZodString;
  } & A2AAgentsRequestSchema["shape"]
>;

export const a2aCallRequestSchema: A2ACallRequestSchema = z.object({
  agent: z.string().trim().min(1).max(253),
  instruction: z.string().trim().min(1).max(2_000),
  selection: z.string().min(1).max(8_000),
  ...a2aAgentsRequestSchema.shape,
});

/**
 * Ask one saved, approved agent about selected markdown, through the same
 * validation, signing and network path as `agent_call`.
 */
export const a2aCallContract: BusContract<
  A2ACallRequestSchema,
  A2APeerAnswerSchema,
  "request"
> = defineBusContract({
  channel: "a2a:call:request",
  request: a2aCallRequestSchema,
  response: a2aPeerAnswerSchema,
  delivery: "request",
});

type A2AAgentsResponseSchema = z.ZodObject<{
  agents: z.ZodArray<z.ZodObject<{ id: z.ZodString; label: z.ZodString }>>;
}>;

export const a2aAgentsResponseSchema: A2AAgentsResponseSchema = z.object({
  agents: z.array(z.object({ id: z.string(), label: z.string() })),
});

export type A2ADirectoryAgent = z.output<
  typeof a2aAgentsResponseSchema
>["agents"][number];

/** The approved agents a Studio author may ask, sorted by label. */
export const a2aAgentsContract: BusContract<
  A2AAgentsRequestSchema,
  A2AAgentsResponseSchema,
  "request"
> = defineBusContract({
  channel: "a2a:call:agents",
  request: a2aAgentsRequestSchema,
  response: a2aAgentsResponseSchema,
  delivery: "request",
});

/**
 * The runtime-state namespace that holds which peers this brain may
 * contact: one record per approved peer, keyed by its domain. It is runtime
 * state so that nothing written as content can approve a peer; the agent
 * directory writes it and the A2A client reads it.
 */
export const A2A_CONTACT_APPROVALS_NAMESPACE = "a2a.contact-approvals";

type A2AContactApprovalSchema = z.ZodObject<{
  approvedAt: z.ZodString;
  approvedBy: z.ZodOptional<z.ZodString>;
}>;

/** An admin's approval of this brain contacting a peer. */
export const a2aContactApprovalSchema: A2AContactApprovalSchema = z.object({
  approvedAt: z.string(),
  /** The user who approved, when a signed-in user did. */
  approvedBy: z.string().optional(),
});

export type A2AContactApproval = z.output<typeof a2aContactApprovalSchema>;

/**
 * The A2A extension a brain declares on its Agent Card to serve its shared
 * entities to peers it trusts. A request activates it with the
 * `X-A2A-Extensions` header and names what it wants in a data part of an
 * ordinary `message/send`; it is answered before any model sees it.
 */
export const ENTITY_SHARING_EXTENSION_URI =
  "https://rizom.ai/ext/entity-sharing/v1";

type EntitySharingGetSchema = z.ZodObject<{
  op: z.ZodLiteral<"get">;
  entityType: z.ZodString;
  id: z.ZodString;
}>;

type EntitySharingRequestSchema = z.ZodDiscriminatedUnion<
  [EntitySharingGetSchema, z.ZodObject<{ op: z.ZodLiteral<"list"> }>]
>;

/**
 * What a peer is asked over the entity-sharing extension: one shared
 * entity by its type and id, or the list of what it shares with the asker.
 */
export const entitySharingRequestSchema: EntitySharingRequestSchema =
  z.discriminatedUnion("op", [
    z.object({
      op: z.literal("get"),
      entityType: z.string().min(1),
      id: z.string().min(1),
    }),
    z.object({ op: z.literal("list") }),
  ]);

type SharedEntityListingSchema = z.ZodObject<{
  entities: z.ZodArray<
    z.ZodObject<{
      entityType: z.ZodString;
      id: z.ZodString;
      title: z.ZodString;
    }>
  >;
}>;

/** What a brain shares with the asker: each entity named, none of its text. */
export const sharedEntityListingSchema: SharedEntityListingSchema = z.object({
  entities: z.array(
    z.object({
      entityType: z.string().min(1),
      id: z.string().min(1),
      title: z.string(),
    }),
  ),
});

export type SharedEntityListing = z.output<typeof sharedEntityListingSchema>;

export type EntitySharingRequest = z.output<typeof entitySharingRequestSchema>;

/**
 * The type a brain keeps its copies of other brains' entities as. Named
 * here because both sides of an exchange know it: the brain that takes a
 * copy stores it as one, and a brain that serves never serves one onward.
 */
export const SHARED_COPY_ENTITY_TYPE = "shared-copy";

type SharedEntityAttestationSchema = z.ZodObject<{
  signedAt: z.ZodString;
  keyId: z.ZodString;
  signature: z.ZodString;
}>;

/**
 * The owner's signature over what it served: the entity's type, id and
 * content hash, and the time, signed with the brain key it publishes for
 * A2A. Anyone holding that key can check a copy against it.
 */
export const sharedEntityAttestationSchema: SharedEntityAttestationSchema =
  z.object({
    signedAt: z.string().min(1),
    /** The signing key, as the owner's JWKS names it. */
    keyId: z.string().min(1),
    signature: z.string().min(1),
  });

export type SharedEntityAttestation = z.output<
  typeof sharedEntityAttestationSchema
>;

type SharedEntitySchema = z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
  markdown: z.ZodString;
  contentHash: z.ZodString;
  attestation: SharedEntityAttestationSchema;
}>;

/**
 * A shared entity as its owner serves it: its stored document, that
 * document's hash, and the owner's signature over the hash.
 */
export const sharedEntitySchema: SharedEntitySchema = z.object({
  entityType: z.string().min(1),
  id: z.string().min(1),
  markdown: z.string(),
  /** The SHA-256 of `markdown`, in hex. */
  contentHash: z.string().min(1),
  attestation: sharedEntityAttestationSchema,
});

export type SharedEntity = z.output<typeof sharedEntitySchema>;

/** The statement an owner signs for an entity it serves. */
export function sharedEntityStatement(entity: {
  entityType: string;
  id: string;
  contentHash: string;
  attestation: { signedAt: string };
}): string {
  return [
    ENTITY_SHARING_EXTENSION_URI,
    entity.entityType,
    entity.id,
    entity.contentHash,
    entity.attestation.signedAt,
  ].join("\n");
}

type SharedEntityAskRequestSchema = z.ZodObject<{
  agent: z.ZodString;
  entityType: z.ZodString;
  id: z.ZodString;
}>;

const sharedEntityAskRequestSchema: SharedEntityAskRequestSchema = z.object({
  /** The saved, approved peer to ask, by its id. */
  agent: z.string().min(1),
  entityType: z.string().min(1),
  id: z.string().min(1),
});

type SharedEntityAskResponseSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ status: z.ZodLiteral<"found">; entity: SharedEntitySchema }>,
    z.ZodObject<{ status: z.ZodLiteral<"not-found"> }>,
    z.ZodObject<{
      status: z.ZodLiteral<"refused">;
      code: z.ZodString;
      error: z.ZodString;
    }>,
  ]
>;

/**
 * What asking a peer for a shared entity comes to: the entity, the peer's
 * one answer for anything it will not serve, or why the peer was not asked
 * or could not be read.
 */
export const sharedEntityAskResponseSchema: SharedEntityAskResponseSchema =
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("found"), entity: sharedEntitySchema }),
    z.object({ status: z.literal("not-found") }),
    z.object({
      status: z.literal("refused"),
      code: z.string(),
      error: z.string(),
    }),
  ]);

export type SharedEntityAskResponse = z.output<
  typeof sharedEntityAskResponseSchema
>;

/** Ask a saved, approved peer for one of its shared entities. */
export const a2aSharedEntityContract: BusContract<
  SharedEntityAskRequestSchema,
  SharedEntityAskResponseSchema,
  "request"
> = defineBusContract({
  channel: "a2a:shared-entity:get",
  request: sharedEntityAskRequestSchema,
  response: sharedEntityAskResponseSchema,
  delivery: "request",
});

type SharedEntityListAskRequestSchema = z.ZodObject<{ agent: z.ZodString }>;

type SharedEntityListAskResponseSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      status: z.ZodLiteral<"found">;
      entities: SharedEntityListingSchema["shape"]["entities"];
    }>,
    z.ZodObject<{ status: z.ZodLiteral<"not-found"> }>,
    z.ZodObject<{
      status: z.ZodLiteral<"refused">;
      code: z.ZodString;
      error: z.ZodString;
    }>,
  ]
>;

export const sharedEntityListAskResponseSchema: SharedEntityListAskResponseSchema =
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("found"),
      entities: sharedEntityListingSchema.shape.entities,
    }),
    z.object({ status: z.literal("not-found") }),
    z.object({
      status: z.literal("refused"),
      code: z.string(),
      error: z.string(),
    }),
  ]);

export type SharedEntityListAskResponse = z.output<
  typeof sharedEntityListAskResponseSchema
>;

/** Ask a saved, approved peer what it shares with this brain. */
export const a2aSharedEntityListContract: BusContract<
  SharedEntityListAskRequestSchema,
  SharedEntityListAskResponseSchema,
  "request"
> = defineBusContract({
  channel: "a2a:shared-entity:list",
  request: z.object({ agent: z.string().min(1) }),
  response: sharedEntityListAskResponseSchema,
  delivery: "request",
});

export const a2aPeerTrustChangedPayloadSchema: z.ZodObject<{
  domain: z.ZodString;
  level: z.ZodEnum<{ trusted: "trusted"; public: "public" }>;
}> = z.object({
  domain: z.string().min(1),
  level: z.enum(["trusted", "public"]),
});

export type A2APeerTrustChangedPayload = z.output<
  typeof a2aPeerTrustChangedPayloadSchema
>;

/**
 * A peer brain's inbound trust changed: granted at `trusted`, or revoked
 * back to `public`. Heard by what keeps per-peer state, such as the room a
 * homeserver keeps for each trusted peer.
 */
export const a2aPeerTrustChangedChannel: Channel<
  A2APeerTrustChangedPayload,
  unknown,
  "a2a:peer-trust-changed"
> = defineChannel("a2a:peer-trust-changed", a2aPeerTrustChangedPayloadSchema);
