import { mock } from "bun:test";
import {
  createEntityPluginContext,
  type EntityPluginContext,
  type IEntityService,
  type BaseEntity,
  type ResolvedProfileSelection,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { PublishMediaData } from "@brains/contracts";
import {
  createMockEntityService,
  type MockEntityServiceReturns,
} from "./mock-entity-service";
import { createMockLogger } from "./mock-logger";
import { createMockShell } from "./mock-shell";
import { genericSpy } from "./generic-spy";
import { spyOnMembers } from "./spy-on-members";

/**
 * Return value configuration for AI namespace methods
 */
export interface MockAIReturns {
  canGenerateImages?: boolean;
  generateImage?: { base64: string; dataUrl: string };
  generateImageError?: Error;
  generate?: Record<string, unknown>;
  generateObject?: unknown;
}

/**
 * Options for creating a mock entity plugin context
 */
export interface MockEntityPluginContextOptions {
  entityService?: IEntityService;
  logger?: Logger;
  entityTypes?: string[];
  pluginId?: string;
  dataDir?: string;
  spaces?: string[];
  profileSelection?: ResolvedProfileSelection;
  returns?: {
    entityService?: MockEntityServiceReturns;
    ai?: MockAIReturns;
    jobsEnqueue?: string;
    attachmentsResolve?: () => Promise<PublishMediaData | undefined>;
    messagingSend?: EntityPluginContext["messaging"]["send"];
  };
  listEntitiesImpl?: (request: { entityType: string }) => Promise<BaseEntity[]>;
}

/**
 * Create a mock EntityPluginContext for testing entity plugin handlers.
 *
 * Includes AI namespace (generate, generateImage, generateObject).
 */
export function createMockEntityPluginContext(
  options: MockEntityPluginContextOptions = {},
): EntityPluginContext {
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

  const shell = createMockShell({ logger, entityService, dataDir, spaces });

  // Build the real context, then layer only what the options configure. The
  // factory guarantees every member exists and stays in step with the
  // interface, so this file cannot drift the way a hand-written literal did.
  const context = createEntityPluginContext(shell, pluginId);

  const ai = returns.ai;

  return {
    ...context,
    // Namespaces tests assert against are wrapped so the factory's real
    // behaviour still runs while calls are recorded.
    entities: spyOnMembers(context.entities),
    prompts: spyOnMembers(context.prompts),
    conversations: spyOnMembers(context.conversations),
    attachments: {
      ...spyOnMembers(context.attachments),
      ...(returns.attachmentsResolve
        ? { resolve: mock(returns.attachmentsResolve) }
        : {}),
      ...(returns.attachmentsResolve ? { hasProvider: mock(() => true) } : {}),
    },
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
            send: genericSpy<EntityPluginContext["messaging"]["send"]>(
              mock(returns.messagingSend),
            ),
          }
        : {}),
    },
    ai: {
      ...spyOnMembers(context.ai),
      generate: genericSpy<EntityPluginContext["ai"]["generate"]>(
        mock(() => Promise.resolve(ai?.generate ?? {})),
      ),
      generateObject: genericSpy<EntityPluginContext["ai"]["generateObject"]>(
        mock(() => Promise.resolve({ object: ai?.generateObject ?? {} })),
      ),
      generateImage: mock(() =>
        ai?.generateImageError
          ? Promise.reject(ai.generateImageError)
          : Promise.resolve(
              ai?.generateImage ?? {
                base64: "mock-base64",
                dataUrl: "data:image/png;base64,mock-base64",
              },
            ),
      ),
      canGenerateImages: mock(() => ai?.canGenerateImages ?? false),
    },
  };
}
