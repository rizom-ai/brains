import { z } from "@brains/utils/zod";
import { canonicalAtprotoRecordSchemas } from "./record-schemas";
import type { AtprotoBrainCardRecord } from "./records";

export const ATPROTO_BRAIN_CARD_DISCOVERED = "atproto:brain-card-discovered";
export const ATPROTO_BRAIN_DISCOVERED = "atproto:brain-discovered";
export const ATPROTO_BRAIN_CARD_REFRESHED = "atproto:brain-card-refreshed";
export const ATPROTO_BRAIN_CARD_UNAVAILABLE = "atproto:brain-card-unavailable";
export const ATPROTO_BRAIN_CARD_CONFLICT = "atproto:brain-card-conflict";
export const ATPROTO_JETSTREAM_GAP = "atproto:jetstream-gap";

const atprotoBrainCardRecordSchema: z.ZodCustom<
  AtprotoBrainCardRecord,
  AtprotoBrainCardRecord
> = z.custom<AtprotoBrainCardRecord>(
  (value) =>
    canonicalAtprotoRecordSchemas["ai.rizom.brain.card"].safeParse(value)
      .success,
);

export const atprotoBrainCardDiscoveredPayloadSchema: z.ZodObject<
  {
    repoDid: z.ZodString;
    uri: z.ZodString;
    cid: z.ZodString;
    record: typeof atprotoBrainCardRecordSchema;
  },
  z.core.$strict
> = z
  .object({
    repoDid: z.string().min(1),
    uri: z.string().min(1),
    cid: z.string().min(1),
    record: atprotoBrainCardRecordSchema,
  })
  .strict();

export type AtprotoBrainCardDiscoveredPayload = z.output<
  typeof atprotoBrainCardDiscoveredPayloadSchema
>;

export const atprotoBrainDiscoveryEventPayloadSchema: z.ZodObject<
  {
    agentId: z.ZodString;
    name: z.ZodString;
    url: z.ZodString;
    status: z.ZodEnum<{
      discovered: "discovered";
      approved: "approved";
      archived: "archived";
    }>;
    repoDid: z.ZodOptional<z.ZodString>;
    brainDid: z.ZodOptional<z.ZodString>;
    anchorDid: z.ZodOptional<z.ZodString>;
    cardUri: z.ZodOptional<z.ZodString>;
    cardCid: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url(),
    status: z.enum(["discovered", "approved", "archived"]),
    repoDid: z.string().min(1).optional(),
    brainDid: z.string().min(1).optional(),
    anchorDid: z.string().min(1).optional(),
    cardUri: z.string().min(1).optional(),
    cardCid: z.string().min(1).optional(),
  })
  .strict();

export type AtprotoBrainDiscoveryEventPayload = z.output<
  typeof atprotoBrainDiscoveryEventPayloadSchema
>;

export const atprotoBrainCardUnavailablePayloadSchema: z.ZodObject<
  {
    repoDid: z.ZodString;
    observedAt: z.ZodString;
    staleAfter: z.ZodOptional<z.ZodString>;
    reason: z.ZodEnum<{
      deleted: "deleted";
      "refresh-failed": "refresh-failed";
    }>;
    error: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z
  .object({
    repoDid: z.string().startsWith("did:plc:"),
    observedAt: z.string().datetime(),
    staleAfter: z.string().datetime().optional(),
    reason: z.enum(["deleted", "refresh-failed"]),
    error: z.string().min(1).optional(),
  })
  .strict();

export type AtprotoBrainCardUnavailablePayload = z.output<
  typeof atprotoBrainCardUnavailablePayloadSchema
>;

export const atprotoBrainCardConflictPayloadSchema: z.ZodObject<
  {
    domain: z.ZodString;
    existingRepoDid: z.ZodOptional<z.ZodString>;
    candidateRepoDid: z.ZodString;
    observedAt: z.ZodString;
    reason: z.ZodString;
  },
  z.core.$strict
> = z
  .object({
    domain: z.string().min(1),
    existingRepoDid: z.string().min(1).optional(),
    candidateRepoDid: z.string().startsWith("did:plc:"),
    observedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

export type AtprotoBrainCardConflictPayload = z.output<
  typeof atprotoBrainCardConflictPayloadSchema
>;

export const atprotoJetstreamGapPayloadSchema: z.ZodObject<
  {
    previousCursorTimeUs: z.ZodNumber;
    clampedCursorTimeUs: z.ZodNumber;
    observedAt: z.ZodString;
  },
  z.core.$strict
> = z
  .object({
    previousCursorTimeUs: z.number().int().nonnegative(),
    clampedCursorTimeUs: z.number().int().nonnegative(),
    observedAt: z.string().datetime(),
  })
  .strict();

export type AtprotoJetstreamGapPayload = z.output<
  typeof atprotoJetstreamGapPayloadSchema
>;
