import { defineChannel, type Channel } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { AtprotoProjectedPostRecord } from "@brains/atproto-contracts";
import type { BrainCardRecord } from "./records";

export interface PublishBrainCardOptions {
  dryRun?: boolean;
}

export interface PublishBrainCardResult {
  record: BrainCardRecord;
  repo?: string;
  uri?: string;
  cid?: string;
  dryRun: boolean;
}

export interface PublishEntityOptions {
  entityType: string;
  entityId?: string;
  slug?: string;
  dryRun?: boolean;
  topics?: string[];
}

export interface PublishPostOptions {
  entityId?: string;
  slug?: string;
  dryRun?: boolean;
  topics?: string[];
}

export interface PublishEntityResult<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
> {
  record: TRecord;
  repo?: string;
  uri?: string;
  cid?: string;
  dryRun: boolean;
}

export type PublishPostResult = PublishEntityResult<AtprotoProjectedPostRecord>;

export interface DiscoverBrainCardsOptions {
  repos: string[];
  /** Internal admission gate used by Jetstream's creation budget. */
  allowNewCandidates?: boolean;
}

export interface DiscoverBrainCardResult {
  repo: string;
  status: "discovered" | "skipped";
  repoDid?: string;
  uri?: string;
  cid?: string;
  created?: boolean;
  retryable?: boolean;
  error?: string;
}

export interface DiscoverBrainCardsResult {
  discovered: number;
  skipped: number;
  results: DiscoverBrainCardResult[];
}

export const ATPROTO_PUBLISH_FAILED = "atproto:publish:failed";

type AtprotoPublishOperationSchema = z.ZodEnum<{
  "publish-card": "publish-card";
  "upsert-record": "upsert-record";
  "delete-record": "delete-record";
}>;

const atprotoPublishOperationSchema: AtprotoPublishOperationSchema = z.enum([
  "publish-card",
  "upsert-record",
  "delete-record",
]);

export type AtprotoPublishOperation = z.output<
  typeof atprotoPublishOperationSchema
>;

type AtprotoPublishFailedPayloadSchema = z.ZodObject<{
  operation: AtprotoPublishOperationSchema;
  entityType: z.ZodString;
  entityId: z.ZodString;
  collection: z.ZodString;
  error: z.ZodString;
}>;

/** An ambient AT Protocol write failed: which one, for which record, and why. */
export const atprotoPublishFailedPayloadSchema: AtprotoPublishFailedPayloadSchema =
  z.object({
    operation: atprotoPublishOperationSchema,
    entityType: z.string(),
    entityId: z.string(),
    collection: z.string(),
    error: z.string(),
  });

export type AtprotoPublishFailedPayload = z.output<
  typeof atprotoPublishFailedPayloadSchema
>;

/** Broadcast when an ambient AT Protocol write fails. */
export const atprotoPublishFailedChannel: Channel<
  AtprotoPublishFailedPayload,
  unknown,
  typeof ATPROTO_PUBLISH_FAILED
> = defineChannel(ATPROTO_PUBLISH_FAILED, atprotoPublishFailedPayloadSchema);
