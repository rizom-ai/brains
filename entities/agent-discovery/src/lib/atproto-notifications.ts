import {
  z,
  type EntityReactionContext,
  type IRuntimeStateStore,
} from "@brains/sdk/entities";
import { computeContentHash } from "@brains/utils/hash";
import type {
  AtprotoBrainCardConflictPayload,
  AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";

/**
 * What the directory noticed on the network but has not yet told anyone about.
 *
 * Recorded whether or not notifications are switched on. Recording used to be
 * gated on the same setting that delivers the alert, so switching alerts on
 * showed nothing that happened before — the backlog had never been written.
 */
export const atprotoNotificationCandidateSchema: z.ZodObject<{
  agentId: z.ZodString;
  name: z.ZodString;
  repoDid: z.ZodOptional<z.ZodString>;
  cardCid: z.ZodOptional<z.ZodString>;
  observedAt: z.ZodString;
  status: z.ZodEnum<{ pending: "pending"; notified: "notified" }>;
}> = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    repoDid: z.string().min(1).optional(),
    cardCid: z.string().min(1).optional(),
    observedAt: z.string().datetime(),
    status: z.enum(["pending", "notified"]),
  })
  .strict();

export type AtprotoNotificationCandidate = z.output<
  typeof atprotoNotificationCandidateSchema
>;

export const atprotoConflictNotificationSchema: z.ZodObject<{
  domain: z.ZodString;
  existingRepoDid: z.ZodOptional<z.ZodString>;
  candidateRepoDid: z.ZodString;
  observedAt: z.ZodString;
  reason: z.ZodString;
}> = z
  .object({
    domain: z.string().min(1),
    existingRepoDid: z.string().min(1).optional(),
    candidateRepoDid: z.string().min(1),
    observedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

export type AtprotoConflictNotification = z.output<
  typeof atprotoConflictNotificationSchema
>;

export const ATPROTO_NOTIFICATIONS_NAMESPACE =
  "agent-discovery.atproto-notifications";
export const ATPROTO_CONFLICTS_NAMESPACE = "agent-discovery.atproto-conflicts";

export function atprotoNotifications(
  context: Pick<EntityReactionContext, "state">,
): IRuntimeStateStore<AtprotoNotificationCandidate> {
  return context.state<AtprotoNotificationCandidate>({
    namespace: ATPROTO_NOTIFICATIONS_NAMESPACE,
    schema: atprotoNotificationCandidateSchema,
  });
}

export function atprotoConflicts(
  context: Pick<EntityReactionContext, "state">,
): IRuntimeStateStore<AtprotoConflictNotification> {
  return context.state<AtprotoConflictNotification>({
    namespace: ATPROTO_CONFLICTS_NAMESPACE,
    schema: atprotoConflictNotificationSchema,
  });
}

/** Note a newly discovered card so a later check can mention it. */
export async function recordDiscoveryCandidate(
  context: Pick<EntityReactionContext, "state">,
  payload: AtprotoBrainDiscoveryEventPayload,
  observedAt: string,
): Promise<void> {
  if (payload.status !== "discovered") return;
  const key = `candidate:${payload.cardCid ?? payload.repoDid ?? payload.agentId}`;
  await atprotoNotifications(context).setIfNotExists(key, {
    agentId: payload.agentId,
    name: payload.name,
    ...(payload.repoDid && { repoDid: payload.repoDid }),
    ...(payload.cardCid && { cardCid: payload.cardCid }),
    observedAt,
    status: "pending",
  });
}

/** Note a blocked repo claim so a later check can mention it. */
export async function recordConflict(
  context: Pick<EntityReactionContext, "state">,
  payload: AtprotoBrainCardConflictPayload,
): Promise<void> {
  const key = `conflict:${computeContentHash(
    `${payload.domain}\0${payload.existingRepoDid ?? ""}\0${payload.candidateRepoDid}`,
  )}`;
  await atprotoConflicts(context).setIfNotExists(key, payload);
}
