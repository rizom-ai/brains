import {
  createMockLogger,
  spyOnMembers,
  type SpiedMembers,
} from "@brains/test-utils";
import { mock } from "bun:test";
import {
  createServicePluginContext,
  type ServicePluginContext,
  type IEntityService,
  type BaseEntity,
  type ResolvedProfileSelection,
  type IMessageBus,
} from "../index";
import type { Logger } from "@brains/utils/logger";
import {
  createMockEntityService,
  type MockEntityServiceReturns,
} from "@brains/entity-service/test";
import { createMockShell } from "./mock-shell";

/**
 * Return value configuration for mock service plugin context methods
 */
export interface MockServicePluginContextReturns {
  /** Return values for entity service methods */
  entityService?: MockEntityServiceReturns;
  /** Return value for jobs.enqueue */
  jobsEnqueue?: string;
}

/**
 * Options for creating a mock service plugin context
 */
export interface MockServicePluginContextOptions {
  /** Custom entity service mock (overrides returns.entityService) */
  entityService?: IEntityService;
  /** Custom logger mock */
  logger?: Logger;
  /** Entity types to register */
  entityTypes?: string[];
  /** Plugin ID */
  pluginId?: string;
  /** Data directory path */
  dataDir?: string;
  /** Shared conversation spaces */
  spaces?: string[];
  /** Composition-selected profile kind, or null for the base profile. */
  profileSelection?: ResolvedProfileSelection;
  /** Pre-configured return values for methods */
  returns?: MockServicePluginContextReturns;
  /** Dynamic implementation for listEntities */
  listEntitiesImpl?: (request: { entityType: string }) => Promise<BaseEntity[]>;
  /**
   * The bus the context's messaging rides; pass one to send on it as the
   * shell does.
   */
  messageBus?: IMessageBus;
}

/**
 * Create a mock ServicePluginContext for testing
 *
 * Builds a real context from a mock shell via createServicePluginContext and
 * layers only what the options configure, so its shape cannot drift from
 * ServicePluginContext. Namespaces tests assert against are recording spies.
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const mockContext = createMockServicePluginContext();
 *
 * // With pre-configured return values (no casts needed!)
 * const mockContext = createMockServicePluginContext({
 *   entityTypes: ["note", "post"],
 *   returns: {
 *     entityService: {
 *       getEntity: mockEntity,
 *       deleteEntity: true,
 *     },
 *     jobsEnqueue: "job-123",
 *   }
 * });
 *
 * // Use in handler/tool tests
 * const result = await myTool.execute(input, mockContext);
 *
 * // Verify interactions
 * expect(mockContext.jobs.enqueue).toHaveBeenCalledWith("my-job", expect.any(Object), null);
 * ```
 */
/**
 * The namespaces this factory wraps in recording spies.
 *
 * Named so the return type can expose them, for the same reason the entity
 * factory does: declaring the result as a plain ServicePluginContext hid the
 * spies from the type system, so a test needing a captured argument had no
 * typed route to it and reached for a cast instead.
 *
 * messaging is spied too but stays off the list: its members are generic, and
 * a Mock records a generic signature with its type parameters erased. Its calls
 * are still recorded and assertable with toHaveBeenCalledWith.
 */
type SpiedNamespace =
  | "content"
  | "entities"
  | "templates"
  | "views"
  | "conversations"
  | "prompts"
  | "endpoints"
  | "interactions"
  | "attachments"
  | "profileKinds"
  | "jobs";

/** A ServicePluginContext whose spied namespaces report their calls. */
export type MockServicePluginContext = Omit<
  ServicePluginContext,
  SpiedNamespace
> & {
  [K in SpiedNamespace]: SpiedMembers<ServicePluginContext[K]>;
};

export function createMockServicePluginContext(
  options: MockServicePluginContextOptions = {},
): MockServicePluginContext {
  const {
    entityTypes = [],
    pluginId = "test-plugin",
    dataDir = "/tmp/test-data",
    spaces = [],
    returns = {},
    listEntitiesImpl,
  } = options;

  const entityService =
    options.entityService ??
    createMockEntityService({
      entityTypes,
      ...(listEntitiesImpl ? { listEntitiesImpl } : {}),
      ...(returns.entityService ? { returns: returns.entityService } : {}),
    });
  const logger = options.logger ?? createMockLogger();

  const shell = createMockShell({
    logger,
    entityService,
    dataDir,
    spaces,
    ...(options.messageBus ? { messageBus: options.messageBus } : {}),
  });

  // Build the real context, then layer only what the options configure. The
  // factory guarantees every member exists and stays in step with the
  // interface, so this file cannot drift the way a hand-written literal did.
  const context = createServicePluginContext(shell, pluginId);

  return {
    ...context,
    // Namespaces tests assert against are wrapped so the factory's real
    // behaviour still runs while calls are recorded.
    content: spyOnMembers(context.content),
    entities: spyOnMembers(context.entities),
    templates: spyOnMembers(context.templates),
    views: spyOnMembers(context.views),
    conversations: spyOnMembers(context.conversations),
    prompts: spyOnMembers(context.prompts),
    endpoints: spyOnMembers(context.endpoints),
    interactions: spyOnMembers(context.interactions),
    attachments: spyOnMembers(context.attachments),
    profileKinds: {
      ...spyOnMembers(context.profileKinds),
      getResolved: mock(() => options.profileSelection ?? null),
    },
    jobs: {
      ...spyOnMembers(context.jobs),
      enqueue: mock(() =>
        Promise.resolve(returns.jobsEnqueue ?? "mock-job-id"),
      ),
    },
    messaging: spyOnMembers(context.messaging),
  };
}
