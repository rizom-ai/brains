import {
  atprotoBlobEvidenceSchema,
  type AtprotoProjectedPostRecord,
  type AtprotoBlobEvidence,
} from "@brains/atproto-contracts";
import { z } from "@brains/utils/zod";
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

export type AtprotoPublishOperation =
  "publish-card" | "upsert-record" | "delete-record";

export interface AtprotoPublishFailedPayload {
  operation: AtprotoPublishOperation;
  entityType: string;
  entityId: string;
  collection: string;
  error: string;
  recovery?: AtprotoBlobEvidence | undefined;
}
export const atprotoPublishFailedPayloadSchema: z.ZodType<AtprotoPublishFailedPayload> =
  z.strictObject({
    operation: z.enum(["publish-card", "upsert-record", "delete-record"]),
    entityType: z.string().max(256),
    entityId: z.string().max(1024),
    collection: z.string().max(256),
    error: z.string().max(1024),
    recovery: atprotoBlobEvidenceSchema.optional(),
  });

export const ATPROTO_PUBLISH_FAILED = "atproto:publish:failed";
