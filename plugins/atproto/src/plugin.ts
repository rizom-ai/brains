import type {
  BaseEntity,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { ServicePlugin, SYSTEM_CHANNELS } from "@brains/plugins";
import { ENTITY_CHANNELS, PUBLISH_CHANNELS } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { type FetchLike } from "@brains/utils/fetch-like";
import {
  assertSafePublicHttpsUrl,
  createSafePublicFetch,
  UnsafePublicResourceError,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import { z } from "@brains/utils/zod";
import {
  atprotoConfigSchema,
  type AtprotoConfig,
  type AtprotoConfigInput,
} from "./config";
import { AtprotoPdsClient } from "./pds-client";
import {
  AtprotoIdentityResolver,
  DiscoveryRejectionError,
} from "./identity-resolver";
import { PublishingTaskQueue } from "./publishing-tasks";
import { buildAtprotoWebRoutes } from "./web-routes";
import {
  type DiscoverBrainCardResult,
  type DiscoverBrainCardsOptions,
  type DiscoverBrainCardsResult,
  type PublishBrainCardOptions,
  type PublishBrainCardResult,
  type PublishEntityOptions,
  type PublishEntityResult,
  type PublishPostOptions,
  type PublishPostResult,
} from "./publish-contracts";

export * from "./publish-contracts";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_UNAVAILABLE,
  ATPROTO_JETSTREAM_GAP,
  AtprotoProjectionRegistry,
  atprotoBrainCardDiscoveredPayloadSchema,
  canonicalAtprotoLexicons,
  listCanonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoBrainCardRecord,
  type AtprotoProjection,
  type AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { buildBrainCardRecord } from "./records";
import {
  JetstreamConsumer,
  type CreateJetstreamSocket,
  type JetstreamDiscoveryOutcome,
} from "./jetstream-consumer";
import packageJson from "../package.json";

const brainCardLexicon = canonicalAtprotoLexicons["ai.rizom.brain.card"];

const entityTriggerPayloadSchema = z.looseObject({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entity: z
    .looseObject({
      visibility: z.string(),
    })
    .optional(),
});

type EntityTriggerPayload = z.infer<typeof entityTriggerPayloadSchema>;

export interface AtprotoPluginDeps {
  createPdsClient?: (config: {
    pdsEndpoint: string;
    identifier: string;
    appPassword: string;
    fetch?: FetchLike | undefined;
  }) => AtprotoPdsClientLike;
  projectionRegistry?: AtprotoProjectionRegistry;
  fetch?: FetchLike;
  resolveHostname?: ResolveHostname;
  createJetstreamSocket?: CreateJetstreamSocket;
  now?: () => number;
  random?: () => number;
}

function entityTaskKey(payload: EntityTriggerPayload): string {
  return `${payload.entityType}/${payload.entityId}`;
}

const BRAIN_CARD_COLLECTION = "ai.rizom.brain.card";
const BRAIN_CARD_RKEY = "self";
const LEXICON_SCHEMA_COLLECTION = "com.atproto.lexicon.schema";
const PUBLISH_COMPLETED = PUBLISH_CHANNELS.completed;
const MAX_DISCOVERY_REPOS = 50;
const BRAIN_CARD_INPUT_ENTITY_TYPES = new Set([
  "brain-character",
  "anchor-profile",
  "skill",
]);

export class AtprotoPlugin extends ServicePlugin<
  AtprotoConfig,
  AtprotoConfigInput
> {
  private readonly deps: AtprotoPluginDeps;
  private readonly projectionRegistry: AtprotoProjectionRegistry;
  private readonly publishingTasks: PublishingTaskQueue;
  private readonly discoveryFetch: FetchLike;
  private readonly identity: AtprotoIdentityResolver;
  private jetstreamConsumer: JetstreamConsumer | undefined;
  private fullBootObserved = false;

  constructor(config: AtprotoConfigInput = {}, deps: AtprotoPluginDeps = {}) {
    super("atproto", packageJson, config, atprotoConfigSchema);
    this.deps = deps;
    this.projectionRegistry =
      deps.projectionRegistry ?? AtprotoProjectionRegistry.getInstance();
    this.discoveryFetch = createSafePublicFetch({
      ...(deps.fetch && { fetchFn: deps.fetch }),
      ...(deps.resolveHostname && { resolveHostname: deps.resolveHostname }),
      timeoutMs: this.config.jetstream.requestTimeoutMs,
      maxResponseBytes: this.config.jetstream.maxResponseBytes,
      maxRedirects: this.config.jetstream.maxRedirects,
    });
    this.publishingTasks = new PublishingTaskQueue(this.logger, () =>
      this.hasPublishingCredentials(),
    );
    this.identity = new AtprotoIdentityResolver({
      fetch: this.discoveryFetch,
      pdsEndpoint: this.config.pdsEndpoint,
      identifier: this.config.identifier ?? "",
      appPassword: this.config.appPassword ?? "",
      requestTimeoutMs: this.config.jetstream.requestTimeoutMs,
      createPdsClient: deps.createPdsClient,
    });
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (!this.config.enabled) return;

    // startup-check boots run ready hooks but never broadcast
    // pluginsRegistered; only a full boot may publish to the PDS.
    context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      this.fullBootObserved = true;
      return { success: true };
    });

    // publish:report:success is a request-style message consumed by the
    // publish pipeline. publish:completed is its broadcast fan-out event.
    context.messaging.subscribe(PUBLISH_COMPLETED, async (message) => {
      const payload = entityTriggerPayloadSchema.safeParse(message.payload);
      if (payload.success) {
        void this.publishingTasks.run(entityTaskKey(payload.data), () =>
          this.reconcileProjectedEntity(context, payload.data),
        );
      }
      return { success: true };
    });

    context.messaging.subscribe(ENTITY_CHANNELS.updated, async (message) => {
      const payload = entityTriggerPayloadSchema.safeParse(message.payload);
      if (payload.success) {
        void this.publishingTasks.run(entityTaskKey(payload.data), () =>
          this.reconcileProjectedEntity(context, payload.data),
        );
        if (
          this.fullBootObserved &&
          BRAIN_CARD_INPUT_ENTITY_TYPES.has(payload.data.entityType)
        ) {
          void this.publishingTasks.run(
            `${BRAIN_CARD_COLLECTION}/${BRAIN_CARD_RKEY}`,
            () =>
              this.publishingTasks.runTrigger(
                context,
                {
                  operation: "publish-card",
                  entityType: "brain-card",
                  entityId: BRAIN_CARD_RKEY,
                  collection: BRAIN_CARD_COLLECTION,
                },
                () => this.publishBrainCard(context),
              ),
          );
        }
      }
      return { success: true };
    });

    context.messaging.subscribe(ENTITY_CHANNELS.deleted, async (message) => {
      const payload = entityTriggerPayloadSchema.safeParse(message.payload);
      if (payload.success) {
        void this.publishingTasks.run(entityTaskKey(payload.data), () =>
          this.deleteProjectedEntityFromTrigger(context, payload.data),
        );
      }
      return { success: true };
    });
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.config.enabled || !this.fullBootObserved) return;

    // Scheduled, not awaited: readyPlugins() is on the boot path, and an
    // unresponsive PDS must not stall startup. Shutdown drains the tasks.
    void this.publishingTasks.run(
      BRAIN_CARD_COLLECTION + "/" + BRAIN_CARD_RKEY,
      () =>
        this.publishingTasks.runTrigger(
          context,
          {
            operation: "publish-card",
            entityType: "brain-card",
            entityId: BRAIN_CARD_RKEY,
            collection: BRAIN_CARD_COLLECTION,
          },
          () => this.publishBrainCard(context),
        ),
    );

    if (this.config.lexiconAuthority) {
      void this.publishingTasks.run(LEXICON_SCHEMA_COLLECTION, () =>
        this.publishCanonicalLexiconSchemas(context),
      );
    }

    if (this.config.jetstream.enabled && !this.jetstreamConsumer) {
      this.jetstreamConsumer = new JetstreamConsumer({
        context,
        config: this.config.jetstream,
        callbacks: {
          discover: async (
            repoDid,
            options,
          ): Promise<JetstreamDiscoveryOutcome> => {
            const result = (
              await this.discoverBrainCards(context, {
                repos: [repoDid],
                allowNewCandidates: options.allowNewCandidate,
              })
            ).results[0];
            return result
              ? {
                  status: result.status,
                  ...(result.created !== undefined && {
                    created: result.created,
                  }),
                  ...(result.retryable !== undefined && {
                    retryable: result.retryable,
                  }),
                  ...(result.error && { error: result.error }),
                }
              : {
                  status: "skipped",
                  retryable: true,
                  error: "Discovery returned no result",
                };
          },
          markUnavailable: async (repoDid, observedAt): Promise<void> => {
            const staleAfter = new Date(
              Date.parse(observedAt) +
                this.config.jetstream.staleCandidateRetentionDays *
                  24 *
                  60 *
                  60 *
                  1000,
            ).toISOString();
            await context.messaging.send({
              type: ATPROTO_BRAIN_CARD_UNAVAILABLE,
              payload: {
                repoDid,
                observedAt,
                staleAfter,
                reason: "deleted",
              },
              broadcast: true,
            });
          },
          publishHeartbeat: async (): Promise<void> => {
            if (!this.hasPublishingCredentials()) return;
            await this.publishBrainCard(context);
          },
          reportGap: async (payload): Promise<void> => {
            await context.messaging.send({
              type: ATPROTO_JETSTREAM_GAP,
              payload: {
                ...payload,
                observedAt: new Date(
                  this.deps.now?.() ?? Date.now(),
                ).toISOString(),
              },
              broadcast: true,
            });
          },
        },
        ...(this.deps.createJetstreamSocket && {
          createSocket: this.deps.createJetstreamSocket,
        }),
        ...(this.deps.now && { now: this.deps.now }),
        ...(this.deps.random && { random: this.deps.random }),
      });
      await this.jetstreamConsumer.start();
    }
  }

  protected override async onShutdown(): Promise<void> {
    await this.jetstreamConsumer?.stop();
    this.jetstreamConsumer = undefined;
    await this.publishingTasks.settle();
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return buildAtprotoWebRoutes(this.config);
  }

  async publishBrainCard(
    context: ServicePluginContext,
    options: PublishBrainCardOptions = {},
  ): Promise<PublishBrainCardResult> {
    const configuredRepo = this.config.repoDid;

    if (options.dryRun) {
      const record = await buildBrainCardRecord(
        context,
        this.config,
        configuredRepo,
      );
      validateAtprotoRecord(brainCardLexicon, record);
      return {
        record,
        dryRun: true,
        ...(configuredRepo && { repo: configuredRepo }),
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
    const targetRepo = configuredRepo ?? session.did;
    const record = await buildBrainCardRecord(context, this.config, targetRepo);
    validateAtprotoRecord(brainCardLexicon, record);
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
        const resolved = await this.identity.resolveRepoPdsEndpoint(repo);
        await assertSafePublicHttpsUrl(
          resolved.pdsEndpoint,
          this.deps.resolveHostname,
        );
        const client = this.identity.createPublicPdsClient(
          resolved.pdsEndpoint,
        );
        if (!client.getRecord) {
          throw new DiscoveryRejectionError(
            "AT Protocol PDS client does not support record reads",
          );
        }
        const record = await client.getRecord({
          repo: resolved.repoDid,
          collection: BRAIN_CARD_COLLECTION,
          rkey: BRAIN_CARD_RKEY,
        });
        const returnedRepo = parseAtUriRepo(record.uri);
        if (returnedRepo !== resolved.repoDid) {
          throw new DiscoveryRejectionError(
            `Returned AT URI repo does not match candidate ${resolved.repoDid}`,
          );
        }
        if (
          record.uri !==
          `at://${resolved.repoDid}/${BRAIN_CARD_COLLECTION}/${BRAIN_CARD_RKEY}`
        ) {
          throw new DiscoveryRejectionError(
            "Returned AT URI is not the canonical brain-card record",
          );
        }

        try {
          validateAtprotoRecord(brainCardLexicon, record.value);
        } catch (error) {
          throw new DiscoveryRejectionError(getErrorMessage(error));
        }
        const validatedCard = atprotoBrainCardDiscoveredPayloadSchema.parse({
          repoDid: resolved.repoDid,
          uri: record.uri,
          cid: record.cid,
          record: record.value,
        }).record;
        await this.identity.verifyBrainCardIdentity(
          resolved.repoDid,
          validatedCard,
        );
        const created = await this.applyDiscoveryAdmission(
          context,
          resolved.repoDid,
          validatedCard,
          options.allowNewCandidates ?? true,
        );

        const recordKey = `${resolved.repoDid}:${record.uri}:${record.cid}`;
        if (seenRecords.has(recordKey)) {
          results.push({
            repo,
            status: "skipped",
            repoDid: resolved.repoDid,
            uri: record.uri,
            cid: record.cid,
            retryable: false,
            error: "Duplicate brain card in discovery batch",
          });
          continue;
        }
        seenRecords.add(recordKey);
        await context.messaging.send({
          type: ATPROTO_BRAIN_CARD_DISCOVERED,
          payload: {
            repoDid: resolved.repoDid,
            uri: record.uri,
            cid: record.cid,
            record: validatedCard,
          },
          broadcast: true,
        });
        results.push({
          repo,
          status: "discovered",
          repoDid: resolved.repoDid,
          uri: record.uri,
          cid: record.cid,
          created,
        });
      } catch (error) {
        results.push({
          repo,
          status: "skipped",
          retryable:
            !(error instanceof DiscoveryRejectionError) &&
            !(error instanceof UnsafePublicResourceError),
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

  private async publishCanonicalLexiconSchemas(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.publishingTasks.runTrigger(
      context,
      {
        operation: "upsert-record",
        entityType: "lexicon-schema",
        entityId: "*",
        collection: LEXICON_SCHEMA_COLLECTION,
      },
      async () => {
        const appPassword = this.resolveAppPassword();
        if (!this.config.identifier || !appPassword) {
          throw new Error(
            "AT Protocol publishing requires identifier and app password configuration",
          );
        }

        const client = this.createPdsClient(appPassword);
        const session = await client.createSession();
        const targetRepo = this.config.repoDid ?? session.did;
        if (!client.putRecord) {
          throw new Error(
            "AT Protocol PDS client does not support record upserts",
          );
        }
        const putRecord = client.putRecord.bind(client);

        for (const lexicon of listCanonicalAtprotoLexicons()) {
          await this.publishingTasks.runTrigger(
            context,
            {
              operation: "upsert-record",
              entityType: "lexicon-schema",
              entityId: lexicon.id,
              collection: LEXICON_SCHEMA_COLLECTION,
            },
            () =>
              putRecord({
                repo: targetRepo,
                collection: LEXICON_SCHEMA_COLLECTION,
                rkey: lexicon.id,
                record: {
                  $type: LEXICON_SCHEMA_COLLECTION,
                  ...lexicon,
                },
              }),
          );
        }
      },
    );
  }

  private async reconcileProjectedEntity(
    context: ServicePluginContext,
    payload: EntityTriggerPayload,
  ): Promise<void> {
    const projection = this.projectionRegistry.get(payload.entityType);
    if (!projection || !this.hasPublishingCredentials()) return;

    let entity: BaseEntity | null;
    try {
      entity = await context.entityService.getEntity({
        entityType: payload.entityType,
        id: payload.entityId,
      });
    } catch (error) {
      await this.publishingTasks.reportFailure(
        context,
        {
          operation: "upsert-record",
          entityType: payload.entityType,
          entityId: payload.entityId,
          collection: projection.collection,
        },
        error,
      );
      return;
    }

    if (entity?.visibility === "public") {
      await this.publishingTasks.runTrigger(
        context,
        {
          operation: "upsert-record",
          entityType: payload.entityType,
          entityId: payload.entityId,
          collection: projection.collection,
        },
        () =>
          this.publishEntity(context, {
            entityType: payload.entityType,
            entityId: payload.entityId,
          }),
      );
      return;
    }

    await this.publishingTasks.runTrigger(
      context,
      {
        operation: "delete-record",
        entityType: payload.entityType,
        entityId: payload.entityId,
        collection: projection.collection,
      },
      () => this.deleteProjectedRecord(projection, payload.entityId),
    );
  }

  private async deleteProjectedEntityFromTrigger(
    context: ServicePluginContext,
    payload: EntityTriggerPayload,
  ): Promise<void> {
    const projection = this.projectionRegistry.get(payload.entityType);
    if (
      !projection ||
      !this.hasPublishingCredentials() ||
      (payload.entity && payload.entity.visibility !== "public")
    ) {
      return;
    }

    await this.publishingTasks.runTrigger(
      context,
      {
        operation: "delete-record",
        entityType: payload.entityType,
        entityId: payload.entityId,
        collection: projection.collection,
      },
      () => this.deleteProjectedRecord(projection, payload.entityId),
    );
  }

  private async deleteProjectedRecord(
    projection: AtprotoProjection,
    entityId: string,
  ): Promise<void> {
    const appPassword = this.resolveAppPassword();
    if (!this.config.identifier || !appPassword) {
      throw new Error(
        "AT Protocol publishing requires identifier and app password configuration",
      );
    }

    const client = this.createPdsClient(appPassword);
    const session = await client.createSession();
    const targetRepo = this.config.repoDid ?? session.did;
    if (!client.deleteRecord) {
      throw new Error(
        "AT Protocol PDS client does not support record deletion",
      );
    }
    await client.deleteRecord({
      repo: targetRepo,
      collection: projection.collection,
      rkey: deriveAtprotoRecordKey(entityId),
    });
  }

  private hasPublishingCredentials(): boolean {
    return Boolean(
      this.config.enabled &&
      this.config.identifier &&
      this.resolveAppPassword(),
    );
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

  private async applyDiscoveryAdmission(
    context: ServicePluginContext,
    repoDid: string,
    record: AtprotoBrainCardRecord,
    allowNewCandidate: boolean,
  ): Promise<boolean> {
    if (!record.siteUrl) {
      throw new DiscoveryRejectionError(
        "Brain card does not advertise a callable web channel",
      );
    }
    const domain = new URL(record.siteUrl).hostname.toLowerCase();
    const deniedDomain = this.config.jetstream.denyDomains
      .map((entry) => entry.toLowerCase())
      .find((entry) => domain === entry || domain.endsWith(`.${entry}`));
    if (deniedDomain) {
      throw new DiscoveryRejectionError(
        `Brain card matched denied domain ${deniedDomain}`,
      );
    }

    const skillKeywords = this.config.jetstream.skillKeywords.map((entry) =>
      entry.toLowerCase(),
    );
    if (skillKeywords.length > 0) {
      const searchable = record.skills
        .flatMap((skill) => [
          skill.name,
          skill.description,
          ...(skill.tags ?? []),
        ])
        .join("\n")
        .toLowerCase();
      if (!skillKeywords.some((keyword) => searchable.includes(keyword))) {
        throw new DiscoveryRejectionError(
          "Brain card did not match configured skill keywords",
        );
      }
    }

    const agents = await context.entityService.listEntities({
      entityType: "agent",
    });
    const existingByDomain = agents.find((agent) => agent.id === domain);
    const existingByRepo = agents.find(
      (agent) => agent.metadata["repoDid"] === repoDid,
    );
    const existingDomainRepo = existingByDomain?.metadata["repoDid"];
    const existingDomainBrain = existingByDomain?.metadata["brainDid"];
    const hasDomainRepoCollision =
      typeof existingDomainRepo === "string" && existingDomainRepo !== repoDid;
    const hasDomainBrainCollision =
      existingDomainRepo === undefined &&
      typeof existingDomainBrain === "string" &&
      existingDomainBrain !== record.brain.did;
    const hasRepoDomainCollision =
      existingByRepo !== undefined && existingByRepo.id !== domain;
    if (
      hasDomainRepoCollision ||
      hasDomainBrainCollision ||
      hasRepoDomainCollision
    ) {
      const existingRepoDid =
        typeof existingDomainRepo === "string" ? existingDomainRepo : undefined;
      await context.messaging.send({
        type: ATPROTO_BRAIN_CARD_CONFLICT,
        payload: {
          domain,
          ...(existingRepoDid && { existingRepoDid }),
          candidateRepoDid: repoDid,
          observedAt: new Date().toISOString(),
          reason: "ATProto agent identity collision",
        },
        broadcast: true,
      });
      throw new DiscoveryRejectionError(
        `ATProto agent identity collision for ${domain}`,
      );
    }

    const existing = existingByDomain ?? existingByRepo;
    if (existing) return false;
    if (!allowNewCandidate) {
      throw new DiscoveryRejectionError(
        "Jetstream new-agent creation rate cap reached",
      );
    }
    const pendingCount = agents.filter(
      (agent) => agent.metadata["status"] === "discovered",
    ).length;
    if (pendingCount >= this.config.jetstream.pendingCandidateCeiling) {
      throw new DiscoveryRejectionError(
        "Jetstream pending-candidate ceiling reached",
      );
    }
    return true;
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

export function atprotoPlugin(
  config?: AtprotoConfigInput,
  deps?: AtprotoPluginDeps,
): AtprotoPlugin {
  return new AtprotoPlugin(config, deps);
}
