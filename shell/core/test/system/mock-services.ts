import type { SystemServices } from "../../src/system/types";
import { createSilentLogger } from "@brains/test-utils";
import {
  getVisibleContentVisibilities,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
  type EntitySearchRequest,
  type ListEntitiesRequest,
} from "@brains/entity-service";
import { z } from "@brains/utils";
import { PermissionService } from "@brains/templates";

type SeedEntity = Omit<BaseEntity, "visibility"> & {
  visibility?: BaseEntity["visibility"];
};
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
  /** Get the last job enqueued via jobs.enqueue */
  getLastEnqueuedJob: () => { type: string; data: unknown } | undefined;
  /** Get the last direct markdown create call */
  getLastMarkdownCreate: () =>
    | { entityType: string; id: string; markdown: string }
    | undefined;
} {
  const entities = new Map<string, BaseEntity>();
  const entityTypes = new Set<string>();

  const addEntities = (ents: SeedEntity[]): void => {
    for (const e of ents) {
      const entity: BaseEntity = { ...e, visibility: e.visibility ?? "public" };
      entities.set(entity.id, entity);
      entityTypes.add(entity.entityType);
    }
  };

  const createInterceptors = new Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  >();

  const defaultFrontmatterSchema = z.object({
    title: z.string().optional(),
    status: z.string().optional(),
  });

  const parseFrontMatter = <T>(markdown: string, schema: z.ZodSchema<T>): T =>
    parseMarkdownWithFrontmatter(markdown, schema).metadata;

  const buildStub = (input: {
    id: string;
    title: string;
  }): { content: string; metadata: Record<string, unknown> } => ({
    content: `---\ntitle: ${input.title}\nstatus: generating\n---\n`,
    metadata: { title: input.title, status: "generating" },
  });

  const entityRegistry = {
    getAdapter: (
      type: string,
    ): {
      supportsCoverImage: boolean;
      hasBody: boolean;
      isSingleton: boolean;
      fromMarkdown: (markdown: string) => unknown;
      parseFrontMatter: <T>(markdown: string, schema: z.ZodSchema<T>) => T;
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
        supportsCoverImage: coverImageEntityTypes.has(type),
        hasBody: true,
        isSingleton: singletonEntityTypes.has(type),
        parseFrontMatter,
        buildStub,
        fromMarkdown: (): unknown => ({}),
      };
    },
    hasEntityType: (type: string) => entityTypes.has(type),
    getAllEntityTypes: () => Array.from(entityTypes),
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
  } as unknown as SystemServices["entityRegistry"];

  const markdownCreates: Array<{
    entityType: string;
    id: string;
    markdown: string;
  }> = [];

  const entityService = {
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
        .map((entity) => ({ entity, score: 1, excerpt: entity.content }));
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
    getEntityTypes: () => Array.from(entityTypes),
    hasEntityType: (type: string) => entityTypes.has(type),
    createEntity: async (request: { entity: SeedEntity }) => {
      const entity = request.entity;
      const id = entity.id || `entity-${Date.now()}`;
      entities.set(id, {
        ...entity,
        id,
        visibility: entity.visibility ?? "public",
      });
      entityTypes.add(entity.entityType);
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    createEntityFromMarkdown: async (request: {
      input: { entityType: string; id: string; markdown: string };
    }) => {
      const input = request.input;
      markdownCreates.push(input);
      entities.set(input.id, {
        id: input.id,
        entityType: input.entityType,
        content: input.markdown,
        contentHash: "",
        visibility: "public",
        metadata: { title: input.id },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      entityTypes.add(input.entityType);
      return { entityId: input.id, jobId: `job-${input.id}`, skipped: false };
    },
    updateEntity: async (request: { entity: BaseEntity }) => {
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
  } as unknown as SystemServices["entityService"];

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
  } as unknown as SystemServices["jobs"];

  const conversationService = {
    getConversation: async () => null,
    listConversations: async () => [],
    searchConversations: async () => [],
    getMessages: async () => [],
  } as unknown as SystemServices["conversationService"];

  return {
    entityService,
    entityRegistry,
    jobs,
    conversationService,
    logger: createSilentLogger("system-test"),
    query: async () => ({ message: "Mock response", summary: "Mock" }),
    getIdentity: () => ({
      name: "Test Brain",
      role: "Test",
      purpose: "Testing",
      values: ["test"],
    }),
    getProfile: () => ({ name: "Test Owner", kind: "professional" as const }),
    getAppInfo: async () => ({
      model: "test",
      version: "1.0.0",
      uptime: 42,
      entities: 0,
      entityCounts: [],
      embeddings: 0,
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
    getLastEnqueuedJob: () => enqueuedJobs[enqueuedJobs.length - 1],
    getLastMarkdownCreate: () => markdownCreates[markdownCreates.length - 1],
  };
}
