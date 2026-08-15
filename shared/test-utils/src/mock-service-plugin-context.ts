import { mock } from "bun:test";
import {
  createServicePluginContext,
  type ServicePluginContext,
  type IEntityService,
  type BaseEntity,
  type ResolvedProfileSelection,
  type MessageSendRequest,
  type MessageResponse,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  createMockEntityService,
  type MockEntityServiceReturns,
} from "./mock-entity-service";
import { createMockLogger } from "./mock-logger";
import { createMockShell } from "./mock-shell";
import { genericSpy } from "./generic-spy";
import { spyOnMembers, type SpiedMembers } from "./spy-on-members";

/**
 * Return value configuration for mock service plugin context methods
 */
export interface MockServicePluginContextReturns {
  /** Return values for entity service methods */
  entityService?: MockEntityServiceReturns;
  /** Return value for jobs.enqueue */
  jobsEnqueue?: string;
  /** Custom messaging.send implementation.
   *
   * Deliberately the concrete shape a test writes rather than the generic
   * MessageSender the namespace declares: a handler returning a specific data
   * type can never satisfy `<T, R>` for arbitrary R. The generic signature is
   * reconstructed once, below, where the context is assembled.
   */
  messagingSend?: (request: MessageSendRequest) => Promise<MessageResponse>;
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
 * messaging stays off the list — some of its members go through genericSpy,
 * which re-applies a generic signature that mock() had erased and cannot also
 * carry a precisely-typed Mock. Its calls are still recorded and assertable
 * with toHaveBeenCalledWith.
 */
type SpiedNamespace =
  | "entities"
  | "templates"
  | "views"
  | "conversations"
  | "prompts"
  | "endpoints"
  | "interactions"
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
  });

  // Build the real context, then layer only what the options configure. The
  // factory guarantees every member exists and stays in step with the
  // interface, so this file cannot drift the way a hand-written literal did.
  const context = createServicePluginContext(shell, pluginId);

  return {
    ...context,
    // Namespaces tests assert against are wrapped so the factory's real
    // behaviour still runs while calls are recorded.
    entities: spyOnMembers(context.entities),
    templates: spyOnMembers(context.templates),
    views: spyOnMembers(context.views),
    conversations: spyOnMembers(context.conversations),
    prompts: spyOnMembers(context.prompts),
    endpoints: spyOnMembers(context.endpoints),
    interactions: spyOnMembers(context.interactions),
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
    messaging: {
      ...spyOnMembers(context.messaging),
      ...(returns.messagingSend
        ? {
            send: genericSpy<ServicePluginContext["messaging"]["send"]>(
              mock(returns.messagingSend),
            ),
          }
        : {}),
    },
  };
}
