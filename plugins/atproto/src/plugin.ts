import type {
  BaseEntity,
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
import { AtprotoPdsClient } from "./pds-client";
import { buildDidWebDocument } from "./did";
import {
  AtprotoProjectionRegistry,
  canonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoProjectedPostRecord,
  type AtprotoProjection,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { buildBrainCardRecord, type BrainCardRecord } from "./records";
import { createAtprotoTools } from "./tools";
import packageJson from "../package.json";

const brainCardLexicon = canonicalAtprotoLexicons["ai.rizom.brain.card"];

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

export class AtprotoPlugin extends ServicePlugin<AtprotoConfig> {
  private readonly deps: AtprotoPluginDeps;
  private readonly projectionRegistry: AtprotoProjectionRegistry;

  constructor(config: AtprotoConfigInput = {}, deps: AtprotoPluginDeps = {}) {
    super("atproto", packageJson, config, atprotoConfigSchema);
    this.deps = deps;
    this.projectionRegistry =
      deps.projectionRegistry ?? AtprotoProjectionRegistry.getInstance();
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
    validateAtprotoRecord(brainCardLexicon, record);
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

  async publishEntity(
    context: ServicePluginContext,
    options: PublishEntityOptions,
  ): Promise<PublishEntityResult> {
    const projection = this.projectionRegistry.get(options.entityType);
    if (!projection) {
      throw new Error(
        `No AT Protocol projection registered for ${options.entityType}`,
      );
    }

    return this.publishProjectedEntity(context, options, projection);
  }

  async publishPost(
    context: ServicePluginContext,
    options: PublishPostOptions,
  ): Promise<PublishPostResult> {
    const projection = this.projectionRegistry.get("post");
    if (!projection) {
      throw new Error("No AT Protocol projection registered for post");
    }

    return this.publishProjectedEntity(
      context,
      { entityType: "post", ...options },
      projection,
    );
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
- Use \`atproto_publish_entity\` to publish any public entity with a registered AT Protocol projection.
- Use \`atproto_publish_post\` for the blog-post convenience path by \`entityId\` or \`slug\`.
- Prefer \`dryRun: true\` first when publishing new AT Protocol records.
- Only public posts and public cover images can be published.`;
  }

  private async publishProjectedEntity<TRecord extends Record<string, unknown>>(
    context: ServicePluginContext,
    options: PublishEntityOptions,
    projection: AtprotoProjection<TRecord>,
  ): Promise<PublishEntityResult<TRecord>> {
    const entity = await this.findPublishEntity(context, options);
    const identifier = options.entityId ?? options.slug;
    if (!identifier) {
      throw new Error(
        `${options.entityType} publish requires entityId or slug`,
      );
    }
    if (!entity) {
      throw new Error(`${options.entityType} not found: ${identifier}`);
    }
    if (entity.visibility !== "public") {
      throw new Error(
        `Cannot publish non-public ${options.entityType}: ${identifier}`,
      );
    }

    const repo = this.config.repoDid;

    if (options.dryRun) {
      const record = await projection.buildRecord({
        entity,
        context,
        config: this.config,
        ...(options.topics && { topics: options.topics }),
        dryRun: true,
      });
      validateAtprotoRecord(projection.lexicon, record);
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
    const record = await projection.buildRecord({
      entity,
      context,
      config: this.config,
      client,
      ...(options.topics && { topics: options.topics }),
    });
    validateAtprotoRecord(projection.lexicon, record);
    const result = await client.createRecord({
      repo: targetRepo,
      collection: projection.collection,
      ...(projection.validate !== undefined && {
        validate: projection.validate,
      }),
      record,
    });
    await projection.onPublished?.({
      entity,
      context,
      record,
      uri: result.uri,
      cid: result.cid,
    });

    return {
      record,
      repo: targetRepo,
      uri: result.uri,
      cid: result.cid,
      dryRun: false,
    };
  }

  private async findPublishEntity(
    context: ServicePluginContext,
    options: PublishEntityOptions,
  ): Promise<BaseEntity | null> {
    if (options.entityId) {
      return context.entityService.getEntity({
        entityType: options.entityType,
        id: options.entityId,
      });
    }

    if (options.slug) {
      return (
        (
          await context.entityService.listEntities({
            entityType: options.entityType,
            options: { filter: { metadata: { slug: options.slug } } },
          })
        )[0] ?? null
      );
    }

    return null;
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
