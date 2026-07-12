import { z } from "@brains/utils/zod";
import { canonicalAtprotoRecordSchemas } from "./record-schemas";
import type { AtprotoBrainCardRecord } from "./records";

export const ATPROTO_BRAIN_CARD_DISCOVERED = "atproto:brain-card-discovered";
export const ATPROTO_BRAIN_DISCOVERED = "atproto:brain-discovered";
export const ATPROTO_BRAIN_CARD_REFRESHED = "atproto:brain-card-refreshed";

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
  status: "discovered" | "approved";
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
  cardUri?: string | undefined;
  cardCid?: string | undefined;
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
      status: z.enum(["discovered", "approved"]),
      repoDid: z.string().min(1).optional(),
      brainDid: z.string().min(1).optional(),
      anchorDid: z.string().min(1).optional(),
      cardUri: z.string().min(1).optional(),
      cardCid: z.string().min(1).optional(),
    })
    .strict();
