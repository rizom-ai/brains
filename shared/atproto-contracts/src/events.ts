import { z } from "@brains/utils/zod";
import { canonicalAtprotoRecordSchemas } from "./record-schemas";
import type { AtprotoBrainCardRecord } from "./records";

export const ATPROTO_BRAIN_CARD_DISCOVERED = "atproto:brain-card-discovered";
export const ATPROTO_BRAIN_DISCOVERED = "atproto:brain-discovered";
export const ATPROTO_BRAIN_CARD_REFRESHED = "atproto:brain-card-refreshed";
export const ATPROTO_BRAIN_CARD_UNAVAILABLE = "atproto:brain-card-unavailable";
export const ATPROTO_BRAIN_CARD_CONFLICT = "atproto:brain-card-conflict";
export const ATPROTO_JETSTREAM_GAP = "atproto:jetstream-gap";

export interface AtprotoBrainCardDiscoveredPayload {
  repoDid: string;
  uri: string;
  cid: string;
  record: AtprotoBrainCardRecord;
}

export interface AtprotoBrainDiscoveryEventPayload {
  agentId: string;
  name: string;
  url: string;
  status: "discovered" | "approved" | "archived";
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
  cardUri?: string | undefined;
  cardCid?: string | undefined;
}

export interface AtprotoBrainCardUnavailablePayload {
  repoDid: string;
  observedAt: string;
  staleAfter?: string | undefined;
  reason: "deleted" | "refresh-failed";
  error?: string | undefined;
}

export interface AtprotoBrainCardConflictPayload {
  domain: string;
  existingRepoDid?: string | undefined;
  candidateRepoDid: string;
  observedAt: string;
  reason: string;
}

export interface AtprotoJetstreamGapPayload {
  previousCursorTimeUs: number;
  clampedCursorTimeUs: number;
  observedAt: string;
}

const atprotoBrainCardRecordSchema: z.ZodType<AtprotoBrainCardRecord> =
  z.custom<AtprotoBrainCardRecord>(
    (value) =>
      canonicalAtprotoRecordSchemas["ai.rizom.brain.card"].safeParse(value)
        .success,
  );

export const atprotoBrainCardDiscoveredPayloadSchema: z.ZodType<AtprotoBrainCardDiscoveredPayload> =
  z
    .object({
      repoDid: z.string().min(1),
      uri: z.string().min(1),
      cid: z.string().min(1),
      record: atprotoBrainCardRecordSchema,
    })
    .strict();

export const atprotoBrainDiscoveryEventPayloadSchema: z.ZodType<AtprotoBrainDiscoveryEventPayload> =
  z
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

export const atprotoBrainCardUnavailablePayloadSchema: z.ZodType<AtprotoBrainCardUnavailablePayload> =
  z
    .object({
      repoDid: z.string().startsWith("did:plc:"),
      observedAt: z.string().datetime(),
      staleAfter: z.string().datetime().optional(),
      reason: z.enum(["deleted", "refresh-failed"]),
      error: z.string().min(1).optional(),
    })
    .strict();

export const atprotoBrainCardConflictPayloadSchema: z.ZodType<AtprotoBrainCardConflictPayload> =
  z
    .object({
      domain: z.string().min(1),
      existingRepoDid: z.string().min(1).optional(),
      candidateRepoDid: z.string().startsWith("did:plc:"),
      observedAt: z.string().datetime(),
      reason: z.string().min(1),
    })
    .strict();

export const atprotoJetstreamGapPayloadSchema: z.ZodType<AtprotoJetstreamGapPayload> =
  z
    .object({
      previousCursorTimeUs: z.number().int().nonnegative(),
      clampedCursorTimeUs: z.number().int().nonnegative(),
      observedAt: z.string().datetime(),
    })
    .strict();
