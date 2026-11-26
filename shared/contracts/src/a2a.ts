import { z } from "@brains/utils/zod";
import { actorRefSchema } from "./actor-ref";
import { SourceCitationSchema } from "./agent-response";
import { defineBusContract, type BusContract } from "./bus-contract";

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

type EntitySharingRequestSchema = z.ZodObject<{
  op: z.ZodLiteral<"get">;
  entityType: z.ZodString;
  id: z.ZodString;
}>;

/** One shared entity asked of a peer, by its type and id. */
export const entitySharingRequestSchema: EntitySharingRequestSchema = z.object({
  op: z.literal("get"),
  entityType: z.string().min(1),
  id: z.string().min(1),
});

export type EntitySharingRequest = z.output<typeof entitySharingRequestSchema>;

type SharedEntitySchema = z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
  markdown: z.ZodString;
  contentHash: z.ZodString;
}>;

/** A shared entity as its owner serves it: its stored document and that document's hash. */
export const sharedEntitySchema: SharedEntitySchema = z.object({
  entityType: z.string().min(1),
  id: z.string().min(1),
  markdown: z.string(),
  contentHash: z.string().min(1),
});

export type SharedEntity = z.output<typeof sharedEntitySchema>;

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
