import type { BaseEntity, EntityServiceClient } from "@brains/entity-service";
import type { PublishImageData } from "@brains/contracts";
import type { AtprotoLexicon } from "./lexicon";
import type { AtprotoBlobRef, AtprotoBrainPostRecord } from "./records";

/**
 * Subset of the AT Protocol plugin config that entity projections may read when
 * building records. Projections delegate uploads to the provided client; PDS auth and
 * transport fields (identifier, endpoint, credentials, repo DID) are
 * intentionally excluded — they stay on the plugin's own config.
 */
export interface AtprotoPublishConfig {
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
}

export interface AtprotoPdsClientLike {
  createSession(): Promise<{
    did: string;
    handle: string;
    accessJwt: string;
    refreshJwt: string;
  }>;
  createRecord(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
    validate?: boolean;
  }): Promise<{ uri: string; cid: string }>;
  putRecord?(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey: string;
    validate?: boolean;
  }): Promise<{ uri: string; cid: string }>;
  getRecord?(input: {
    repo: string;
    collection: string;
    rkey: string;
  }): Promise<{ uri: string; cid: string; value: Record<string, unknown> }>;
  deleteRecord?(input: {
    repo: string;
    collection: string;
    rkey: string;
  }): Promise<void>;
  uploadBlob?(input: PublishImageData): Promise<{ blob: AtprotoBlobRef }>;
}

/**
 * Structural view of the plugin context that AT Protocol projections receive.
 * Projections read/update entities and borrow inspected asset files, so the
 * contract exposes those capabilities instead of the plugin framework's full
 * ServicePluginContext (which satisfies this interface structurally).
 */
export interface AtprotoProjectionContext {
  entityService: Pick<
    EntityServiceClient,
    "getEntity" | "statAsset" | "fileAssets" | "updateEntity"
  >;
}

export interface AtprotoProjectionBuildInput {
  entity: BaseEntity;
  context: AtprotoProjectionContext;
  config: AtprotoPublishConfig;
  client?: AtprotoPdsClientLike;
  topics?: string[];
  dryRun?: boolean;
}

export type AtprotoProjectedPostRecord = AtprotoBrainPostRecord;

export interface AtprotoProjectionPublishedInput<
  TRecord extends Record<string, unknown>,
> {
  entity: BaseEntity;
  context: AtprotoProjectionContext;
  record: TRecord;
  uri: string;
  cid: string;
}

export interface AtprotoProjection<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
> {
  entityType: string;
  collection: string;
  lexicon: AtprotoLexicon;
  validate?: boolean;
  buildRecord(input: AtprotoProjectionBuildInput): Promise<TRecord>;
  onPublished?(input: AtprotoProjectionPublishedInput<TRecord>): Promise<void>;
}
