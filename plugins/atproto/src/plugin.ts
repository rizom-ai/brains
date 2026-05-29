import type {
  ServicePluginContext,
  Tool,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils";
import {
  atprotoConfigSchema,
  type AtprotoConfig,
  type AtprotoConfigInput,
} from "./config";
import {
  AtprotoPdsClient,
  type AtprotoSession,
  type CreateRecordResult,
} from "./pds-client";
import {
  buildBlueskyPostRecord,
  type BlueskyFeedPostRecord,
} from "./bluesky-post";
import { buildDidWebDocument } from "./did";
import { buildPostRecord, type BrainPostRecord } from "./post-record";
import { buildBrainCardRecord, type BrainCardRecord } from "./records";
import { createAtprotoTools } from "./tools";
import packageJson from "../package.json";

export interface AtprotoPdsClientLike {
  createSession(): Promise<AtprotoSession>;
  createRecord(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
    validate?: boolean;
  }): Promise<CreateRecordResult>;
}

export interface AtprotoPluginDeps {
  createPdsClient?: (config: {
    pdsEndpoint: string;
    identifier: string;
    appPassword: string;
  }) => AtprotoPdsClientLike;
}

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

export interface PublishPostOptions {
  entityId: string;
  dryRun?: boolean;
  topics?: string[];
  crossPostToBluesky?: boolean;
}

export interface PublishPostResult {
  record: BrainPostRecord;
  repo?: string;
  uri?: string;
  cid?: string;
  dryRun: boolean;
  bluesky?: {
    record: BlueskyFeedPostRecord;
    uri?: string;
    cid?: string;
  };
}

export class AtprotoPlugin extends ServicePlugin<AtprotoConfig> {
  private readonly deps: AtprotoPluginDeps;

  constructor(config: AtprotoConfigInput = {}, deps: AtprotoPluginDeps = {}) {
    super("atproto", packageJson, config, atprotoConfigSchema);
    this.deps = deps;
  }

  override getWebRoutes(): WebRouteDefinition[] {
    if (!this.config.enabled) return [];

    const didDocument = buildDidWebDocument(this.config);
    if (!didDocument) return [];

    return [
      {
        path: "/.well-known/did.json",
        method: "GET",
        public: true,
        handler: (): Response =>
          new Response(JSON.stringify(didDocument), {
            headers: { "Content-Type": "application/did+json" },
          }),
      },
    ];
  }

  async publishBrainCard(
    context: ServicePluginContext,
    options: PublishBrainCardOptions = {},
  ): Promise<PublishBrainCardResult> {
    const record = await buildBrainCardRecord(context, this.config);
    const repo = this.config.repoDid;

    if (options.dryRun) {
      return {
        record,
        dryRun: true,
        ...(repo && { repo }),
      };
    }

    const appPassword = this.resolveAppPassword();
    if (!this.config.identifier || !appPassword) {
      throw new Error(
        "AT Protocol publishing requires identifier and app password configuration",
      );
    }

    const client = this.createPdsClient(appPassword);
    const session = await client.createSession();
    const targetRepo = repo ?? session.did;
    const result = await client.createRecord({
      repo: targetRepo,
      collection: "ai.rizom.brain.card",
      rkey: "self",
      validate: true,
      record,
    });

    return {
      record,
      repo: targetRepo,
      uri: result.uri,
      cid: result.cid,
      dryRun: false,
    };
  }

  async publishPost(
    context: ServicePluginContext,
    options: PublishPostOptions,
  ): Promise<PublishPostResult> {
    const entity = await context.entityService.getEntity({
      entityType: "post",
      id: options.entityId,
    });

    if (!entity) {
      throw new Error(`Post not found: ${options.entityId}`);
    }
    if (entity.visibility !== "public") {
      throw new Error(`Cannot publish non-public post: ${options.entityId}`);
    }

    const record = buildPostRecord(entity, {
      ...(this.config.brainDid && { brainDid: this.config.brainDid }),
      ...(this.config.anchorDid && { anchorDid: this.config.anchorDid }),
      ...(options.topics && { topics: options.topics }),
    });
    const repo = this.config.repoDid;
    const blueskyRecord = options.crossPostToBluesky
      ? buildBlueskyPostRecord(record)
      : undefined;

    if (options.dryRun) {
      return {
        record,
        dryRun: true,
        ...(repo && { repo }),
        ...(blueskyRecord && { bluesky: { record: blueskyRecord } }),
      };
    }

    const appPassword = this.resolveAppPassword();
    if (!this.config.identifier || !appPassword) {
      throw new Error(
        "AT Protocol publishing requires identifier and app password configuration",
      );
    }

    const client = this.createPdsClient(appPassword);
    const session = await client.createSession();
    const targetRepo = repo ?? session.did;
    const result = await client.createRecord({
      repo: targetRepo,
      collection: "ai.rizom.brain.post",
      validate: true,
      record,
    });

    const blueskyResult = blueskyRecord
      ? await client.createRecord({
          repo: targetRepo,
          collection: "app.bsky.feed.post",
          validate: true,
          record: blueskyRecord,
        })
      : undefined;

    return {
      record,
      repo: targetRepo,
      uri: result.uri,
      cid: result.cid,
      dryRun: false,
      ...(blueskyRecord && {
        bluesky: {
          record: blueskyRecord,
          ...(blueskyResult && {
            uri: blueskyResult.uri,
            cid: blueskyResult.cid,
          }),
        },
      }),
    };
  }

  async validatePdsCredentials(): Promise<boolean> {
    const appPassword = this.resolveAppPassword();
    if (!this.config.identifier || !appPassword) return false;

    try {
      await this.createPdsClient(appPassword).createSession();
      return true;
    } catch (error) {
      this.logger.warn("AT Protocol PDS authentication failed", {
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.config.enabled) return [];
    return createAtprotoTools(this.id, this, this.getContext());
  }

  private createPdsClient(appPassword: string): AtprotoPdsClientLike {
    if (this.deps.createPdsClient) {
      return this.deps.createPdsClient({
        pdsEndpoint: this.config.pdsEndpoint,
        identifier: this.config.identifier ?? "",
        appPassword,
      });
    }

    return new AtprotoPdsClient({
      pdsEndpoint: this.config.pdsEndpoint,
      identifier: this.config.identifier ?? "",
      appPassword,
    });
  }

  private resolveAppPassword(): string | undefined {
    if (this.config.appPassword) return this.config.appPassword;
    if (!this.config.appPasswordEnv) return undefined;
    return process.env[this.config.appPasswordEnv];
  }
}

export function atprotoPlugin(
  config?: AtprotoConfigInput,
  deps?: AtprotoPluginDeps,
): AtprotoPlugin {
  return new AtprotoPlugin(config, deps);
}
