import type { LoggerContract } from "@brains/sdk/services";
import type { BaseEntity, ListOptions } from "@brains/sdk/entities";
import { getErrorMessage } from "@brains/utils/error";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  assertSafePublicHttpsUrl,
  createSafePublicFetch,
  UnsafePublicResourceError,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  AtprotoProjectionRegistry,
  atprotoBrainCardDiscoveredPayloadSchema,
  canonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoBrainCardRecord,
  type AtprotoPdsClientLike,
  type AtprotoProjection,
  type AtprotoProjectionContext,
} from "@brains/atproto-contracts";
import type { AtprotoConfig } from "./config";
import {
  AtprotoIdentityResolver,
  DiscoveryRejectionError,
} from "./identity-resolver";
import type { CreateJetstreamSocket } from "./jetstream-consumer";
import { AtprotoPdsClient } from "./pds-client";
import type {
  DiscoverBrainCardResult,
  DiscoverBrainCardsOptions,
  DiscoverBrainCardsResult,
  PublishBrainCardOptions,
  PublishBrainCardResult,
  PublishEntityOptions,
  PublishEntityResult,
  PublishPostOptions,
  PublishPostResult,
} from "./publish-contracts";
import { buildBrainCardRecord, type AtprotoBrainSource } from "./records";

const brainCardLexicon = canonicalAtprotoLexicons["ai.rizom.brain.card"];

export const BRAIN_CARD_COLLECTION = "ai.rizom.brain.card";
export const BRAIN_CARD_RKEY = "self";
const MAX_DISCOVERY_REPOS = 50;

/**
 * Runtime collaborators the service needs that are not configuration.
 *
 * Config is schema-validated operator input; a PDS client factory, a fetch
 * implementation or a websocket constructor is not. Threading them here lets
 * a test hand the publisher fakes and read the writes off them. Production
 * leaves them unset and the real clients are used.
 */
export interface AtprotoServiceDeps {
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

/**
 * The reads a publisher makes of the brain's records: the entity it is asked
 * to project, and the agents already known when a peer is discovered. Reads
 * only — the service owns no entity types and writes none.
 */
export interface AtprotoEntityReads {
  getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null>;
  listEntities(request: {
    entityType: string;
    options?: ListOptions | undefined;
  }): Promise<BaseEntity[]>;
}

/**
 * Where announcements go. A discovered peer, an identity collision or a
 * failed publish is news for every package that cares, so this broadcasts;
 * the runtime hands one to `ready` and to every subscription handler.
 */
export interface AtprotoAnnouncer {
  publish(message: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

export interface AtprotoPublisherInput {
  readonly config: AtprotoConfig;
  /** How the brain presents itself, for the card. */
  readonly brain: AtprotoBrainSource;
  readonly entities: AtprotoEntityReads;
  readonly logger: LoggerContract;
  readonly deps?: AtprotoServiceDeps | undefined;
}

/**
 * Everything the service does against a PDS, over one configuration.
 *
 * Built once at setup from the runtime's reads; the same object is what an
 * operator's composition tooling and the boot tests drive directly.
 */
export interface AtprotoPublisher {
  publishBrainCard(
    options?: PublishBrainCardOptions,
  ): Promise<PublishBrainCardResult>;
  publishEntity(options: PublishEntityOptions): Promise<PublishEntityResult>;
  publishPost(options: PublishPostOptions): Promise<PublishPostResult>;
  discoverBrainCards(
    announce: AtprotoAnnouncer,
    options: DiscoverBrainCardsOptions,
  ): Promise<DiscoverBrainCardsResult>;
  validatePdsCredentials(): Promise<boolean>;
  /** Whether this brain can write to a PDS at all. */
  hasPublishingCredentials(): boolean;
  /** One entity, as the brain has it; the projection's source. */
  readEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null>;
  /** The projection registered for an entity type, if any. */
  projectionFor(entityType: string): AtprotoProjection | undefined;
  deleteProjectedRecord(
    projection: AtprotoProjection,
    entityId: string,
  ): Promise<void>;
  /** A session-holding client for the configured repo, or undefined without credentials. */
  authenticatedClient(): Promise<
    { client: AtprotoPdsClientLike; repo: string } | undefined
  >;
}

export function createAtprotoPublisher(
  input: AtprotoPublisherInput,
): AtprotoPublisher {
  const { config, brain, entities, logger } = input;
  const deps = input.deps ?? {};
  const projectionRegistry =
    deps.projectionRegistry ?? AtprotoProjectionRegistry.getInstance();
  const discoveryFetch = createSafePublicFetch({
    ...(deps.fetch && { fetchFn: deps.fetch }),
    ...(deps.resolveHostname && { resolveHostname: deps.resolveHostname }),
    timeoutMs: config.jetstream.requestTimeoutMs,
    maxResponseBytes: config.jetstream.maxResponseBytes,
    maxRedirects: config.jetstream.maxRedirects,
  });
  const identity = new AtprotoIdentityResolver({
    fetch: discoveryFetch,
    pdsEndpoint: config.pdsEndpoint,
    identifier: config.identifier ?? "",
    appPassword: config.appPassword ?? "",
    requestTimeoutMs: config.jetstream.requestTimeoutMs,
    createPdsClient: deps.createPdsClient,
  });

  // What a projection sees of the brain. A projection declared on an entity
  // is bound by the runtime to its own package's writes before it reaches the
  // registry; this context is what a projection registered directly gets,
  // and this service may not write on anyone's behalf.
  const projectionContext: AtprotoProjectionContext = {
    entityService: {
      getEntity: (request) => entities.getEntity(request),
      updateEntity: async () => {
        throw new Error(
          "An AT Protocol projection writes through the package that declared it; @brains/atproto owns no entity types",
        );
      },
    },
  };

  const hasPublishingCredentials = (): boolean =>
    Boolean(config.enabled && config.identifier && config.appPassword);

  const createPdsClient = (appPassword: string): AtprotoPdsClientLike =>
    deps.createPdsClient
      ? deps.createPdsClient({
          pdsEndpoint: config.pdsEndpoint,
          identifier: config.identifier ?? "",
          appPassword,
        })
      : new AtprotoPdsClient({
          pdsEndpoint: config.pdsEndpoint,
          identifier: config.identifier ?? "",
          appPassword,
        });

  const requireCredentials = (): AtprotoPdsClientLike => {
    if (!config.identifier || !config.appPassword) {
      throw new Error(
        "AT Protocol publishing requires identifier and app password configuration",
      );
    }
    return createPdsClient(config.appPassword);
  };

  const openSession = async (): Promise<{
    client: AtprotoPdsClientLike;
    repo: string;
  }> => {
    const client = requireCredentials();
    const session = await client.createSession();
    return { client, repo: config.repoDid ?? session.did };
  };

  const publishBrainCard = async (
    options: PublishBrainCardOptions = {},
  ): Promise<PublishBrainCardResult> => {
    const configuredRepo = config.repoDid;

    if (options.dryRun) {
      const record = await buildBrainCardRecord(brain, config, configuredRepo);
      validateAtprotoRecord(brainCardLexicon, record);
      return {
        record,
        dryRun: true,
        ...(configuredRepo && { repo: configuredRepo }),
      };
    }

    const { client, repo } = await openSession();
    const record = await buildBrainCardRecord(brain, config, repo);
    validateAtprotoRecord(brainCardLexicon, record);
    if (!client.putRecord) {
      throw new Error("AT Protocol PDS client does not support record upserts");
    }
    const result = await client.putRecord({
      repo,
      collection: BRAIN_CARD_COLLECTION,
      rkey: BRAIN_CARD_RKEY,
      validate: false,
      record,
    });

    return { record, repo, uri: result.uri, cid: result.cid, dryRun: false };
  };

  const findPublishEntity = async (
    options: PublishEntityOptions,
  ): Promise<BaseEntity | null> => {
    if (options.entityId) {
      return entities.getEntity({
        entityType: options.entityType,
        id: options.entityId,
      });
    }
    if (options.slug) {
      return (
        (
          await entities.listEntities({
            entityType: options.entityType,
            options: { filter: { metadata: { slug: options.slug } } },
          })
        )[0] ?? null
      );
    }
    return null;
  };

  const publishProjectedEntity = async <
    TRecord extends Record<string, unknown>,
  >(
    options: PublishEntityOptions,
    projection: AtprotoProjection<TRecord>,
  ): Promise<PublishEntityResult<TRecord>> => {
    const entity = await findPublishEntity(options);
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

    if (options.dryRun) {
      const record = await projection.buildRecord({
        entity,
        context: projectionContext,
        config,
        ...(options.topics && { topics: options.topics }),
        dryRun: true,
      });
      validateAtprotoRecord(projection.lexicon, record);
      return {
        record,
        dryRun: true,
        ...(config.repoDid && { repo: config.repoDid }),
      };
    }

    const { client, repo } = await openSession();
    const record = await projection.buildRecord({
      entity,
      context: projectionContext,
      config,
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
      repo,
      collection: projection.collection,
      rkey: deriveAtprotoRecordKey(entity.id),
      ...(projection.validate !== undefined && {
        validate: projection.validate,
      }),
      record,
    });
    await projection.onPublished?.({
      entity,
      context: projectionContext,
      record,
      uri: result.uri,
      cid: result.cid,
    });

    return { record, repo, uri: result.uri, cid: result.cid, dryRun: false };
  };

  const publishEntity = async (
    options: PublishEntityOptions,
  ): Promise<PublishEntityResult> => {
    const projection = projectionRegistry.get(options.entityType);
    if (!projection) {
      throw new Error(
        `No AT Protocol projection registered for ${options.entityType}`,
      );
    }
    return publishProjectedEntity(options, projection);
  };

  const publishPost = async (
    options: PublishPostOptions,
  ): Promise<PublishPostResult> => {
    const projection = projectionRegistry.get("post");
    if (!projection) {
      throw new Error("No AT Protocol projection registered for post");
    }
    return publishProjectedEntity(
      { entityType: "post", ...options },
      projection,
    );
  };

  const applyDiscoveryAdmission = async (
    announce: AtprotoAnnouncer,
    repoDid: string,
    record: AtprotoBrainCardRecord,
    allowNewCandidate: boolean,
  ): Promise<boolean> => {
    if (!record.siteUrl) {
      throw new DiscoveryRejectionError(
        "Brain card does not advertise a callable web channel",
      );
    }
    const domain = new URL(record.siteUrl).hostname.toLowerCase();
    const deniedDomain = config.jetstream.denyDomains
      .map((entry) => entry.toLowerCase())
      .find((entry) => domain === entry || domain.endsWith(`.${entry}`));
    if (deniedDomain) {
      throw new DiscoveryRejectionError(
        `Brain card matched denied domain ${deniedDomain}`,
      );
    }

    const skillKeywords = config.jetstream.skillKeywords.map((entry) =>
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

    const agents = await entities.listEntities({ entityType: "agent" });
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
      await announce.publish({
        topic: ATPROTO_BRAIN_CARD_CONFLICT,
        data: {
          domain,
          ...(existingRepoDid && { existingRepoDid }),
          candidateRepoDid: repoDid,
          observedAt: new Date().toISOString(),
          reason: "ATProto agent identity collision",
        },
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
    if (pendingCount >= config.jetstream.pendingCandidateCeiling) {
      throw new DiscoveryRejectionError(
        "Jetstream pending-candidate ceiling reached",
      );
    }
    return true;
  };

  const discoverOne = async (
    announce: AtprotoAnnouncer,
    repo: string,
    allowNewCandidates: boolean,
    seenRecords: Set<string>,
  ): Promise<DiscoverBrainCardResult> => {
    try {
      const resolved = await identity.resolveRepoPdsEndpoint(repo);
      await assertSafePublicHttpsUrl(
        resolved.pdsEndpoint,
        deps.resolveHostname,
      );
      const client = identity.createPublicPdsClient(resolved.pdsEndpoint);
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
      await identity.verifyBrainCardIdentity(resolved.repoDid, validatedCard);
      const created = await applyDiscoveryAdmission(
        announce,
        resolved.repoDid,
        validatedCard,
        allowNewCandidates,
      );

      const recordKey = `${resolved.repoDid}:${record.uri}:${record.cid}`;
      if (seenRecords.has(recordKey)) {
        return {
          repo,
          status: "skipped",
          repoDid: resolved.repoDid,
          uri: record.uri,
          cid: record.cid,
          retryable: false,
          error: "Duplicate brain card in discovery batch",
        };
      }
      seenRecords.add(recordKey);
      await announce.publish({
        topic: ATPROTO_BRAIN_CARD_DISCOVERED,
        data: {
          repoDid: resolved.repoDid,
          uri: record.uri,
          cid: record.cid,
          record: validatedCard,
        },
      });
      return {
        repo,
        status: "discovered",
        repoDid: resolved.repoDid,
        uri: record.uri,
        cid: record.cid,
        created,
      };
    } catch (error) {
      return {
        repo,
        status: "skipped",
        retryable:
          !(error instanceof DiscoveryRejectionError) &&
          !(error instanceof UnsafePublicResourceError),
        error: getErrorMessage(error),
      };
    }
  };

  const discoverBrainCards = async (
    announce: AtprotoAnnouncer,
    options: DiscoverBrainCardsOptions,
  ): Promise<DiscoverBrainCardsResult> => {
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

    // Sequential on purpose: the batch dedupes records it has already
    // announced, and admission counts the agents the previous repo created.
    const seenRecords = new Set<string>();
    const results = await repos.reduce<Promise<DiscoverBrainCardResult[]>>(
      async (previous, repo) => [
        ...(await previous),
        await discoverOne(
          announce,
          repo,
          options.allowNewCandidates ?? true,
          seenRecords,
        ),
      ],
      Promise.resolve([]),
    );

    return {
      discovered: results.filter((result) => result.status === "discovered")
        .length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
    };
  };

  const validatePdsCredentials = async (): Promise<boolean> => {
    if (!config.identifier || !config.appPassword) return false;
    try {
      await createPdsClient(config.appPassword).createSession();
      return true;
    } catch (error) {
      logger.warn("AT Protocol PDS authentication failed", {
        error: getErrorMessage(error),
      });
      return false;
    }
  };

  const deleteProjectedRecord = async (
    projection: AtprotoProjection,
    entityId: string,
  ): Promise<void> => {
    const { client, repo } = await openSession();
    if (!client.deleteRecord) {
      throw new Error(
        "AT Protocol PDS client does not support record deletion",
      );
    }
    await client.deleteRecord({
      repo,
      collection: projection.collection,
      rkey: deriveAtprotoRecordKey(entityId),
    });
  };

  return {
    publishBrainCard,
    publishEntity,
    publishPost,
    discoverBrainCards,
    validatePdsCredentials,
    hasPublishingCredentials,
    readEntity: (request) => entities.getEntity(request),
    projectionFor: (entityType) => projectionRegistry.get(entityType),
    deleteProjectedRecord,
    authenticatedClient: async () =>
      hasPublishingCredentials() ? openSession() : undefined,
  };
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
