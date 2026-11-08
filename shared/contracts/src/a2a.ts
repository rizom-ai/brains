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
