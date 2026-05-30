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
  type PutRecordResult,
  type UploadBlobResult,
} from "./pds-client";
import {
  buildBlueskyPostRecord,
  type BlueskyFeedPostRecord,
} from "./bluesky-post";
import { buildDidWebDocument } from "./did";
import { type BrainPostRecord } from "./post-record";
import { createPostProjection } from "./post-projection";
import { AtprotoProjectionRegistry } from "./projection-registry";
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
  putRecord?(input: {
    repo: string;
    collection: string;
    record: Record<string, unknown>;
    rkey: string;
    validate?: boolean;
  }): Promise<PutRecordResult>;
  uploadBlob?(input: {
    data: Buffer;
    mimeType: string;
  }): Promise<UploadBlobResult>;
}

export interface AtprotoPluginDeps {
  createPdsClient?: (config: {
    pdsEndpoint: string;
    identifier: string;
    appPassword: string;
  }) => AtprotoPdsClientLike;
  projectionRegistry?: AtprotoProjectionRegistry;
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
  entityId?: string;
  slug?: string;
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
  private readonly projectionRegistry: AtprotoProjectionRegistry;

  constructor(config: AtprotoConfigInput = {}, deps: AtprotoPluginDeps = {}) {
    super("atproto", packageJson, config, atprotoConfigSchema);
    this.deps = deps;
    this.projectionRegistry =
      deps.projectionRegistry ?? AtprotoProjectionRegistry.getInstance();
    if (!this.projectionRegistry.has("post")) {
      this.projectionRegistry.register(createPostProjection());
    }
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
    if (!client.putRecord) {
      throw new Error("AT Protocol PDS client does not support record upserts");
    }
    const result = await client.putRecord({
      repo: targetRepo,
      collection: "ai.rizom.brain.card",
      rkey: "self",
      validate: false,
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
    const entity = options.entityId
      ? await context.entityService.getEntity({
          entityType: "post",
          id: options.entityId,
        })
      : options.slug
        ? (
            await context.entityService.listEntities({
              entityType: "post",
              options: { filter: { metadata: { slug: options.slug } } },
            })
          )[0]
        : null;

    const identifier = options.entityId ?? options.slug;
    if (!identifier) {
      throw new Error("Post publish requires entityId or slug");
    }
    if (!entity) {
      throw new Error(`Post not found: ${identifier}`);
    }
    if (entity.visibility !== "public") {
      throw new Error(`Cannot publish non-public post: ${identifier}`);
    }

    const projection = this.projectionRegistry.get("post");
    if (!projection) {
      throw new Error("No AT Protocol projection registered for post");
    }
    const repo = this.config.repoDid;

    if (options.dryRun) {
      const record = (await projection.buildRecord({
        entity,
        context,
        config: this.config,
        ...(options.topics && { topics: options.topics }),
      })) as BrainPostRecord;
      const dryRunBlueskyRecord = options.crossPostToBluesky
        ? buildBlueskyPostRecord(record)
        : undefined;
      return {
        record,
        dryRun: true,
        ...(repo && { repo }),
        ...(dryRunBlueskyRecord && {
          bluesky: { record: dryRunBlueskyRecord },
        }),
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
    const record = (await projection.buildRecord({
      entity,
      context,
      config: this.config,
      client,
      ...(options.topics && { topics: options.topics }),
    })) as BrainPostRecord;
    const blueskyRecord = options.crossPostToBluesky
      ? buildBlueskyPostRecord(record)
      : undefined;
    const result = await client.createRecord({
      repo: targetRepo,
      collection: projection.collection,
      ...(projection.validate !== undefined && {
        validate: projection.validate,
      }),
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

  protected override async getInstructions(): Promise<string | undefined> {
    if (!this.config.enabled) return undefined;
    return `## AT Protocol publishing
- Use \`atproto_validate_credentials\` to check PDS credentials before publishing.
- Use \`atproto_publish_card\` to publish or dry-run this brain's public capability card.
- Use \`atproto_publish_post\` to publish a public blog post by \`entityId\` or \`slug\`.
- Prefer \`dryRun: true\` first when publishing new AT Protocol records.
- Only public posts and public cover images can be published.`;
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
