import { z } from "@brains/utils/zod";
import { canonicalAtprotoRecordSchemas } from "./record-schemas";
import type { AtprotoBrainCardRecord } from "./records";

export const ATPROTO_BRAIN_CARD_DISCOVERED = "atproto:brain-card-discovered";
export const ATPROTO_BRAIN_DISCOVERED = "atproto:brain-discovered";
export const ATPROTO_BRAIN_CARD_REFRESHED = "atproto:brain-card-refreshed";

export const atprotoBrainCardDiscoveredPayloadSchema = z
  .object({
    repoDid: z.string().min(1),
    uri: z.string().min(1),
    cid: z.string().min(1),
    // The card schema validates the full nested card shape, so the parsed
    // record can be consumed as a typed AtprotoBrainCardRecord rather than an
    // untyped property bag.
    record: canonicalAtprotoRecordSchemas[
      "ai.rizom.brain.card"
    ] as unknown as z.ZodType<AtprotoBrainCardRecord>,
  })
  .strict();

export type AtprotoBrainCardDiscoveredPayload = z.infer<
  typeof atprotoBrainCardDiscoveredPayloadSchema
>;

export const atprotoBrainDiscoveryEventPayloadSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url(),
    status: z.enum(["discovered", "approved"]),
    repoDid: z.string().min(1).optional(),
    brainDid: z.string().min(1).optional(),
    anchorDid: z.string().min(1).optional(),
    cardUri: z.string().min(1).optional(),
    cardCid: z.string().min(1).optional(),
  })
  .strict();

export type AtprotoBrainDiscoveryEventPayload = z.infer<
  typeof atprotoBrainDiscoveryEventPayloadSchema
>;
