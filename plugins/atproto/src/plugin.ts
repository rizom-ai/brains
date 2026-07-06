import type {
  BaseEntity,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { getErrorMessage, type FetchLike } from "@brains/utils";
import { z } from "@brains/utils/zod";
import {
  atprotoConfigSchema,
  type AtprotoConfig,
  type AtprotoConfigInput,
} from "./config";
import { AtprotoPdsClient } from "./pds-client";
import {
  buildConfiguredDidWebDocuments,
  buildConventionalDidWebDocuments,
} from "./did";
import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  AtprotoProjectionRegistry,
  canonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoProjectedPostRecord,
  type AtprotoProjection,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { buildBrainCardRecord, type BrainCardRecord } from "./records";
import packageJson from "../package.json";

const brainCardLexicon = canonicalAtprotoLexicons["ai.rizom.brain.card"];

const handleResolutionResponseSchema = z.looseObject({
  did: z.string(),
});

const didDocumentSchema = z.looseObject({
  service: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        type: z.string().optional(),
        serviceEndpoint: z.string().optional(),
      }),
    )
    .optional(),
});

export interface AtprotoPluginDeps {
  createPdsClient?: (config: {
    pdsEndpoint: string;
    identifier: string;
    appPassword: string;
  }) => AtprotoPdsClientLike;
  projectionRegistry?: AtprotoProjectionRegistry;
  fetch?: FetchLike;
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

export interface DiscoverBrainCardsOptions {
  repos: string[];
}

export interface DiscoverBrainCardResult {
  repo: string;
  status: "discovered" | "skipped";
  repoDid?: string;
  uri?: string;
  cid?: string;
  error?: string;
}

export interface DiscoverBrainCardsResult {
  discovered: number;
  skipped: number;
  results: DiscoverBrainCardResult[];
}

const BRAIN_CARD_COLLECTION = "ai.rizom.brain.card";
const BRAIN_CARD_RKEY = "self";
const MAX_DISCOVERY_REPOS = 50;

export class AtprotoPlugin extends ServicePlugin<
  AtprotoConfig,
  AtprotoConfigInput
> {
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

    const configuredDocuments = buildConfiguredDidWebDocuments(this.config);
    const conventionalPaths = [
      ...(!this.config.brainDid ? ["/.well-known/did.json"] : []),
      ...(!this.config.anchorDid ? ["/anchor/did.json"] : []),
    ];
    const paths = [
      ...new Set([
        ...configuredDocuments.map((entry) => entry.path),
        ...conventionalPaths,
      ]),
    ];

    return paths.map((path) => ({
      path,
      method: "GET",
      public: true,
      handler: (request: Request): Response => {
        const hostname = new URL(request.url).hostname;
        const candidates = [
          ...buildConfiguredDidWebDocuments(this.config),
          ...buildConventionalDidWebDocuments(this.config, hostname),
        ].filter((entry) => entry.path === path);
        const match =
          candidates.find((entry) => entry.hostname === hostname) ??
          candidates[0];
        if (!match) return new Response("Not found", { status: 404 });
        return new Response(JSON.stringify(match.document), {
          headers: { "Content-Type": "application/did+json" },
        });
      },
    }));
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

  async discoverBrainCards(
    context: ServicePluginContext,
    options: DiscoverBrainCardsOptions,
  ): Promise<DiscoverBrainCardsResult> {
    const repos = [...new Set(options.repos.map((repo) => repo.trim()))].filter(
      (repo) => repo.length > 0,
    );
    if (repos.length === 0) {
      throw new Error(
        "AT Protocol discovery requires at least one repo DID or handle",
      );
    }
    if (repos.length > MAX_DISCOVERY_REPOS) {
      throw new Error(
        `AT Protocol discovery accepts at most ${MAX_DISCOVERY_REPOS} repos per batch`,
      );
    }

    const seenRecords = new Set<string>();
    const results: DiscoverBrainCardResult[] = [];
    for (const repo of repos) {
      try {
        const resolved = await this.resolveRepoPdsEndpoint(repo);
        const client = this.createPublicPdsClient(resolved.pdsEndpoint);
        if (!client.getRecord) {
          throw new Error(
            "AT Protocol PDS client does not support record reads",
          );
        }
        const record = await client.getRecord({
          repo: resolved.repoDid,
          collection: BRAIN_CARD_COLLECTION,
          rkey: BRAIN_CARD_RKEY,
        });
        validateAtprotoRecord(brainCardLexicon, record.value);
        const repoDid = parseAtUriRepo(record.uri) ?? resolved.repoDid;
        const recordKey = `${repoDid}:${record.uri}:${record.cid}`;
        if (seenRecords.has(recordKey)) {
          results.push({
            repo,
            status: "skipped",
            repoDid,
            uri: record.uri,
            cid: record.cid,
            error: "Duplicate brain card in discovery batch",
          });
          continue;
        }
        seenRecords.add(recordKey);
        await context.messaging.send({
          type: ATPROTO_BRAIN_CARD_DISCOVERED,
          payload: {
            repoDid,
            uri: record.uri,
            cid: record.cid,
            record: record.value,
          },
          broadcast: true,
        });
        results.push({
          repo,
          status: "discovered",
          repoDid,
          uri: record.uri,
          cid: record.cid,
        });
      } catch (error) {
        results.push({
          repo,
          status: "skipped",
          error: getErrorMessage(error),
        });
      }
    }

    return {
      discovered: results.filter((result) => result.status === "discovered")
        .length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
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

  protected override async getTools(): Promise<[]> {
    return [];
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
    if (!client.putRecord) {
      throw new Error("AT Protocol PDS client does not support record upserts");
    }
    // Upsert under a stable key derived from the source entity so republishing
    // the same entity updates its record in place instead of creating a duplicate.
    const result = await client.putRecord({
      repo: targetRepo,
      collection: projection.collection,
      rkey: deriveAtprotoRecordKey(entity.id),
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

  private createPublicPdsClient(pdsEndpoint: string): AtprotoPdsClientLike {
    if (this.deps.createPdsClient) {
      return this.deps.createPdsClient({
        pdsEndpoint,
        identifier: this.config.identifier ?? "",
        appPassword: this.config.appPassword ?? "",
      });
    }

    return new AtprotoPdsClient({
      pdsEndpoint,
      identifier: this.config.identifier ?? "",
      appPassword: this.config.appPassword ?? "",
    });
  }

  private async resolveRepoPdsEndpoint(repo: string): Promise<{
    repoDid: string;
    pdsEndpoint: string;
  }> {
    const repoDid = repo.startsWith("did:")
      ? repo
      : await this.resolveHandleToDid(repo);
    if (!repoDid) {
      throw new Error(`Could not resolve AT Protocol repo: ${repo}`);
    }
    const pdsEndpoint = await this.resolveDidToPdsEndpoint(repoDid);
    if (!pdsEndpoint) {
      throw new Error(`Could not resolve AT Protocol PDS for repo: ${repoDid}`);
    }
    return { repoDid, pdsEndpoint };
  }

  private async resolveHandleToDid(
    handle: string,
  ): Promise<string | undefined> {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      this.config.pdsEndpoint,
    );
    url.searchParams.set("handle", handle);
    const response = await this.fetch(url.toString());
    if (!response.ok) return undefined;
    const body = handleResolutionResponseSchema.safeParse(
      await response.json(),
    );
    return body.success ? body.data.did : undefined;
  }

  private async resolveDidToPdsEndpoint(
    did: string,
  ): Promise<string | undefined> {
    const didDocument = did.startsWith("did:plc:")
      ? await this.fetchJson(`https://plc.directory/${encodeURIComponent(did)}`)
      : did.startsWith("did:web:")
        ? await this.fetchJson(didWebDocumentUrl(did))
        : undefined;
    const parsed = didDocumentSchema.safeParse(didDocument);
    if (!parsed.success) return undefined;

    const pdsService = parsed.data.service?.find(
      (service) =>
        service.id === "#atproto_pds" ||
        service.type === "AtprotoPersonalDataServer",
    );
    return pdsService?.serviceEndpoint;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.fetch(url);
    if (!response.ok) return undefined;
    return response.json() as Promise<unknown>;
  }

  private fetch(input: string): Promise<Response> {
    const fetchFn = this.deps.fetch ?? fetch;
    return fetchFn(input);
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
    return this.config.appPassword;
  }
}

// AT Protocol record keys allow [A-Za-z0-9._~:-] up to 512 chars. Entity ids are
// already within that set, but sanitize defensively so any entity type is safe.
function deriveAtprotoRecordKey(entityId: string): string {
  const sanitized = entityId.replace(/[^A-Za-z0-9._~:-]/g, "_").slice(0, 512);
  return sanitized.length > 0 ? sanitized : "self";
}

function parseAtUriRepo(uri: string): string | undefined {
  const match = /^at:\/\/([^/]+)/.exec(uri);
  return match?.[1];
}

function didWebDocumentUrl(did: string): string {
  const parts = did.slice("did:web:".length).split(":").map(decodeURIComponent);
  const [host, ...pathParts] = parts;
  if (!host) throw new Error(`Invalid did:web value: ${did}`);
  if (pathParts.length === 0) return `https://${host}/.well-known/did.json`;
  return `https://${host}/${pathParts.join("/")}/did.json`;
}

export function atprotoPlugin(
  config?: AtprotoConfigInput,
  deps?: AtprotoPluginDeps,
): AtprotoPlugin {
  return new AtprotoPlugin(config, deps);
}
