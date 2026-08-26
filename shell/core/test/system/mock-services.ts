/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * The two behaviour objects below carry no annotation on purpose: several of
 * their members stand in for generic ones, and a concrete return can never
 * satisfy a signature whose type parameter the caller chooses. Without an
 * annotation the rule stops exempting them as typed function expressions.
 *
 * Their shapes are still checked — Object.assign folds each into a value
 * annotated with the real service type — so per-member return types would add
 * noise without adding safety. Before this file dropped its assertions the
 * same functions were exempt for the same reason, just implicitly.
 */
import type { SystemServices } from "../../src/system/types";
import {
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  EntityRegistry,
  getVisibleContentVisibilities,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
  type EntitySearchRequest,
  type ListEntitiesRequest,
} from "@brains/entity-service";
import type {
  AttachmentProvider,
  AttachmentResolveRequest,
} from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { PermissionService } from "@brains/templates";

type SeedEntity = Omit<BaseEntity, "visibility"> & {
  visibility?: BaseEntity["visibility"];
};

interface Parser<T> {
  parse(input: unknown): T;
}

import { createInsightsRegistry } from "../../src/system/insights";

/**
 * Create mock SystemServices for testing system tools.
 * Stateful: entity store tracks creates/updates/deletes.
 */
export function createMockSystemServices(
  overrides: Partial<SystemServices> = {},
): SystemServices & {
  /** Access the in-memory entity store */
  getEntities: () => Map<string, BaseEntity>;
  /** Seed entities for testing */
  addEntities: (entities: SeedEntity[]) => void;
  /** Register entity types without seeding entities (mirrors plugin registration) */
  registerEntityTypes: (types: string[]) => void;
  /** Get the last job enqueued via jobs.enqueue */
  getLastEnqueuedJob: () => { type: string; data: unknown } | undefined;
  /** Get the last direct create request */
  getLastCreateRequest: () => unknown;
  /** Get the last update request */
  getLastUpdateRequest: () => unknown;
  /** Get the last direct markdown create call */
  getLastMarkdownCreate: () =>
    { entityType: string; id: string; markdown: string } | undefined;
} {
  const entities = new Map<string, BaseEntity>();
  // Types that have seeded entity data. Drives data-presence behavior such as
  // getEffectiveFrontmatterSchema (a type only has a frontmatter schema once
  // it actually carries structured data in these tests).
  const entityTypes = new Set<string>();
  // Types a plugin has registered. Drives registration semantics
  // (hasEntityType / getEntityTypes), independent of whether data exists.
  // Seeding data implies registration, but registration can exist without data.
  const registeredTypes = new Set<string>();

  const addEntities = (ents: SeedEntity[]): void => {
    for (const e of ents) {
      const entity: BaseEntity = { ...e, visibility: e.visibility ?? "public" };
      entities.set(entity.id, entity);
      entityTypes.add(entity.entityType);
      registeredTypes.add(entity.entityType);
    }
  };

  const registerEntityTypes = (types: string[]): void => {
    for (const type of types) {
      registeredTypes.add(type);
    }
  };

  const createInterceptors = new Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  >();
  const uploadSaveHandlers: Array<{
    entityType: string;
    mediaTypes: string[];
    handler: (...args: unknown[]) => Promise<unknown>;
  }> = [];

  const defaultFrontmatterSchema = z.object({
    title: z.string().optional(),
    status: z.string().optional(),
  });

  const parseFrontMatter = <T>(markdown: string, schema: Parser<T>): T =>
    parseMarkdownWithFrontmatter(markdown, schema).metadata;

  const buildStub = (input: {
    id: string;
    title: string;
  }): { content: string; metadata: Record<string, unknown> } => ({
    content: `---\ntitle: ${input.title}\nstatus: generating\n---\n`,
    metadata: { title: input.title, status: "generating" },
  });

  // Unannotated for the same reason as the entity service behaviour below:
  // getAdapter stands in for a generic member.
  const entityRegistryBehaviour = {
    getAdapter: (
      type: string,
    ): {
      purpose: string;
      supportsCoverImage: boolean;
      hasBody: boolean;
      isSingleton: boolean;
      fromMarkdown: (markdown: string) => unknown;
      parseFrontMatter: <T>(markdown: string, schema: Parser<T>) => T;
      buildStub: (input: { id: string; title: string }) => {
        content: string;
        metadata: Record<string, unknown>;
      };
    } => {
      const coverImageEntityTypes = new Set([
        "deck",
        "post",
        "project",
        "series",
        "social-post",
      ]);
      const singletonEntityTypes = new Set([
        "anchor-profile",
        "brain-character",
        "site-info",
      ]);

      if (type === "link") {
        return {
          purpose: "Test entity for unit tests.",
          supportsCoverImage: false,
          hasBody: true,
          isSingleton: false,
          parseFrontMatter,
          buildStub,
          fromMarkdown: (markdown: string): unknown => {
            const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
            if (!match) {
              throw new Error("Invalid link markdown");
            }

            const frontmatter = match[1] ?? "";
            const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim();
            const status = frontmatter.match(/^status:\s*(.+)$/m)?.[1]?.trim();
            const url = frontmatter.match(/^url:\s*(.+)$/m)?.[1]?.trim();
            const domain = frontmatter.match(/^domain:\s*(.+)$/m)?.[1]?.trim();
            const capturedAt = frontmatter
              .match(/^capturedAt:\s*(.+)$/m)?.[1]
              ?.trim();
            const sourceRef = frontmatter
              .match(/^\s+ref:\s*(.+)$/m)?.[1]
              ?.trim();
            const sourceLabel = frontmatter
              .match(/^\s+label:\s*(.+)$/m)?.[1]
              ?.trim();

            if (
              !title ||
              !status ||
              !url ||
              !domain ||
              !capturedAt ||
              !sourceRef ||
              !sourceLabel
            ) {
              throw new Error("Incomplete link frontmatter");
            }

            return {
              content: markdown,
              entityType: "link",
              metadata: {
                title: title.replace(/^['"]|['"]$/g, ""),
                status: status.replace(/^['"]|['"]$/g, ""),
              },
            };
          },
        };
      }

      return {
        purpose: "Test entity for unit tests.",
        supportsCoverImage: coverImageEntityTypes.has(type),
        hasBody: true,
        isSingleton: singletonEntityTypes.has(type),
        parseFrontMatter,
        buildStub,
        fromMarkdown: (): unknown => ({}),
      };
    },
    hasEntityType: (type: string) => registeredTypes.has(type),
    getAllEntityTypes: () => Array.from(registeredTypes),
    getEntityTypeConfig: (type: string) =>
      type === "social-post"
        ? { publish: { publishStatuses: ["queued", "published", "failed"] } }
        : {},
    getEffectiveFrontmatterSchema: (type: string) =>
      entityTypes.has(type) ? defaultFrontmatterSchema : undefined,
    registerCreateInterceptor: (
      type: string,
      interceptor: (...args: unknown[]) => Promise<unknown>,
    ) => {
      createInterceptors.set(type, interceptor);
    },
    getCreateInterceptor: (type: string) => createInterceptors.get(type),
    registerUploadSaveHandler: (registration: {
      entityType: string;
      mediaTypes: string[];
      handler: (...args: unknown[]) => Promise<unknown>;
    }) => {
      uploadSaveHandlers.push(registration);
    },
    getUploadSaveHandler: (mediaType: string) =>
      uploadSaveHandlers.find((registration) =>
        registration.mediaTypes.some((pattern) =>
          pattern.endsWith("/*")
            ? mediaType.startsWith(pattern.slice(0, -1))
            : mediaType === pattern,
        ),
      ),
  };

  /** The behaviour above, over a real registry, as with the entity service. */
  const entityRegistry: SystemServices["entityRegistry"] = Object.assign(
    EntityRegistry.createFresh(createSilentLogger()),
    entityRegistryBehaviour,
  );

  const markdownCreates: Array<{
    entityType: string;
    id: string;
    markdown: string;
    visibility?: BaseEntity["visibility"];
  }> = [];
  let lastCreateRequest: unknown;
  let lastUpdateRequest: unknown;

  // The in-memory behaviour these tests drive. Left unannotated: several of
  // these members stand in for generic ones, and a concrete return can never
  // satisfy a signature whose type parameter the caller chooses.
  const entityServiceBehaviour = {
    search: async (request: EntitySearchRequest) => {
      const scope = request.options?.visibilityScope;
      const allowed = scope
        ? new Set(getVisibleContentVisibilities(scope))
        : null;
      const typeFilter = request.options?.types;
      return Array.from(entities.values())
        .filter((e) => {
          if (typeFilter?.length && !typeFilter.includes(e.entityType))
            return false;
          if (allowed && !allowed.has(e.visibility)) return false;
          return true;
        })
        .map((entity) => ({
          entity,
          score:
            typeof entity.metadata["searchScore"] === "number"
              ? entity.metadata["searchScore"]
              : 1,
          excerpt: entity.content,
        }))
        .filter((result) => {
          const minScore = request.options?.minScore;
          return minScore === undefined || result.score >= minScore;
        });
    },
    getEntity: async (request: {
      entityType: string;
      id: string;
      visibilityScope?: BaseEntity["visibility"];
    }) => {
      const entity = entities.get(request.id);
      if (entity?.entityType !== request.entityType) return null;
      const scope = request.visibilityScope ?? "public";
      const allowed = new Set(getVisibleContentVisibilities(scope));
      return allowed.has(entity.visibility) ? entity : null;
    },
    listEntities: async (request: ListEntitiesRequest) => {
      const scope = request.options?.filter?.visibilityScope;
      const allowed = scope
        ? new Set(getVisibleContentVisibilities(scope))
        : null;
      const metadataFilter = request.options?.filter?.metadata;
      return Array.from(entities.values()).filter((e) => {
        if (e.entityType !== request.entityType) return false;
        if (allowed && !allowed.has(e.visibility)) return false;
        if (!metadataFilter) return true;
        return Object.entries(metadataFilter).every(
          ([key, value]) => e.metadata[key] === value,
        );
      });
    },
    getEntityTypes: () => Array.from(registeredTypes),
    hasEntityType: (type: string) => registeredTypes.has(type),
    createEntity: async (request: { entity: SeedEntity }) => {
      lastCreateRequest = request;
      const entity = request.entity;
      const id = entity.id || `entity-${Date.now()}`;
      entities.set(id, {
        ...entity,
        id,
        visibility: entity.visibility ?? "public",
      });
      entityTypes.add(entity.entityType);
      registeredTypes.add(entity.entityType);
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    createEntityFromMarkdown: async (request: {
      input: {
        entityType: string;
        id: string;
        markdown: string;
        visibility?: BaseEntity["visibility"];
      };
    }) => {
      lastCreateRequest = request;
      const input = request.input;
      markdownCreates.push(input);
      entities.set(input.id, {
        id: input.id,
        entityType: input.entityType,
        content: input.markdown,
        contentHash: "",
        visibility: input.visibility ?? "public",
        metadata: { title: input.id },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      entityTypes.add(input.entityType);
      registeredTypes.add(input.entityType);
      return { entityId: input.id, jobId: `job-${input.id}`, skipped: false };
    },
    updateEntity: async (request: { entity: BaseEntity }) => {
      lastUpdateRequest = request;
      const entity = request.entity;
      entities.set(entity.id, entity);
      return { entityId: entity.id, jobId: `job-${entity.id}`, skipped: false };
    },
    deleteEntity: async (request: { entityType: string; id: string }) => {
      entities.delete(request.id);
      return true;
    },
    getEntityCounts: async (visibilityScope?: BaseEntity["visibility"]) => {
      const scope = visibilityScope ?? "public";
      const allowed = new Set(getVisibleContentVisibilities(scope));
      const countMap = new Map<string, number>();
      for (const e of entities.values()) {
        if (!allowed.has(e.visibility)) continue;
        countMap.set(e.entityType, (countMap.get(e.entityType) ?? 0) + 1);
      }
      return Array.from(countMap.entries()).map(([entityType, count]) => ({
        entityType,
        count,
      }));
    },
    countEntities: async (request: { entityType: string }) => {
      let count = 0;
      for (const e of entities.values()) {
        if (e.entityType === request.entityType) count++;
      }
      return count;
    },
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (md: string) => ({ content: md }) as BaseEntity,
  };

  /**
   * The behaviour above, over a complete entity service.
   *
   * Object.assign returns the intersection of the two, which is assignable to
   * IEntityService without an assertion — the factory contributes every member
   * this fake never implemented, and the behaviour overrides the handful the
   * tests drive. The cast this replaces covered the whole object, so none of
   * those members was checked against the interface at all.
   */
  const entityService: SystemServices["entityService"] = Object.assign(
    createMockEntityService(),
    entityServiceBehaviour,
  );

  const enqueuedJobs: Array<{
    type: string;
    data: unknown;
  }> = [];
  const jobs = {
    enqueue: async (request: {
      type: string;
      data: unknown;
    }): Promise<string> => {
      enqueuedJobs.push({
        type: request.type,
        data: request.data,
      });
      return `job-${Date.now()}`;
    },
    enqueueBatch: async () => `batch-${Date.now()}`,
    getLastEnqueued: () => enqueuedJobs[enqueuedJobs.length - 1],
    registerHandler: () => {},
    getActiveJobs: async () => [],
    getActiveBatches: async () => [],
    getBatchStatus: async () => null,
    getStatus: async () => null,
    // An accessor the tests read; declared in the annotation below so it is an
    // addition to the namespace rather than an unchecked extra.
  } satisfies SystemServices["jobs"] & {
    getLastEnqueued: () => { type: string; data: unknown } | undefined;
  };

  // Members the system commands never reach throw rather than being absent, so
  // a command that starts calling one says so instead of receiving undefined.
  const unreached = (name: string) => (): never => {
    throw new Error(`${name} is not reachable from the system commands`);
  };

  const conversationService: SystemServices["conversationService"] = {
    getConversation: async () => null,
    listConversations: async () => [],
    listConversationsUpdatedSince: async () => [],
    searchConversations: async () => [],
    getMessages: async () => [],
    startConversation: unreached("startConversation"),
    addMessage: unreached("addMessage"),
    countMessages: unreached("countMessages"),
    updateConversationMetadata: unreached("updateConversationMetadata"),
    deleteConversation: unreached("deleteConversation"),
    close: unreached("close"),
  };

  const runtimeUploads: SystemServices["runtimeUploads"] = {
    scoped: () => ({
      readRecord: async (): Promise<never> => {
        throw new Error("Upload ref not found");
      },
      read: async (): Promise<never> => {
        throw new Error("Upload ref not found");
      },
      save: unreached("save"),
      remove: unreached("remove"),
      toResponseBody: unreached("toResponseBody"),
      prune: unreached("prune"),
      getUploadDir: unreached("getUploadDir"),
    }),
  };

  // AttachmentProvider rather than a locally invented shape: the fake declared
  // resolve as (...args: unknown[]) => unknown, which accepts providers the
  // real namespace would reject and returns something no caller could use. The
  // cast that used to sit at the end of this object hid both.
  const attachmentProviders = new Map<string, AttachmentProvider>();
  const attachmentKey = (
    sourceEntityType: string,
    attachmentType: string,
  ): string => `${sourceEntityType}:${attachmentType}`;
  const attachments = {
    register: (
      sourceEntityType: string,
      attachmentType: string,
      provider: AttachmentProvider,
    ): (() => void) => {
      const key = attachmentKey(sourceEntityType, attachmentType);
      attachmentProviders.set(key, provider);
      return (): void => {
        attachmentProviders.delete(key);
      };
    },
    resolve: async (
      request: AttachmentResolveRequest,
    ): Promise<PublishMediaData | undefined> => {
      const provider = attachmentProviders.get(
        attachmentKey(request.sourceEntityType, request.attachmentType),
      );
      return provider?.resolve(request);
    },
    hasProvider: (sourceEntityType: string, attachmentType: string) =>
      attachmentProviders.has(attachmentKey(sourceEntityType, attachmentType)),
    getProviderMetadata: (sourceEntityType: string, attachmentType: string) =>
      attachmentProviders.get(attachmentKey(sourceEntityType, attachmentType))
        ?.metadata,
  } satisfies SystemServices["attachments"];

  return {
    entityService,
    entityRegistry,
    jobs,
    conversationService,
    runtimeUploads,
    attachments,
    logger: createSilentLogger("system-test"),
    query: async () => ({ message: "Mock response", summary: "Mock" }),
    getIdentity: () => ({
      name: "Test Brain",
      role: "Test",
      purpose: "Testing",
      values: ["test"],
    }),
    getProfile: () => ({ name: "Test Owner" }),
    getAppInfo: async () => ({
      model: "test",
      version: "1.0.0",
      uptime: 42,
      entities: 0,
      entityCounts: [],
      embeddings: 0,
      backgroundWork: {
        status: "operational",
        reasons: [],
        worker: {
          state: "active",
          activeSessions: 1,
          staleSessions: 0,
          latestHeartbeatAgeMs: 0,
        },
        queue: {
          duePending: 0,
          processing: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          stalled: false,
        },
      },
      ai: {
        model: "gpt-4.1",
        embeddingModel: "text-embedding-3-small",
      },
      daemons: [],
      endpoints: [],
      interactions: [],
    }),
    searchLimit: 10,
    insights: createInsightsRegistry(),
    permissionService: new PermissionService({}),
    ...overrides,
    // Test helpers
    getEntities: () => entities,
    addEntities,
    registerEntityTypes,
    getLastEnqueuedJob: () => enqueuedJobs[enqueuedJobs.length - 1],
    getLastCreateRequest: () => lastCreateRequest,
    getLastUpdateRequest: () => lastUpdateRequest,
    getLastMarkdownCreate: () => markdownCreates[markdownCreates.length - 1],
  };
}
