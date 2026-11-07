/**
 * A brain a package's tests run: the runtime itself, in the test's process,
 * on its own services and storage.
 *
 * What crosses this boundary is the package's configured definitions going
 * in, and the public forms the brain answers with coming back: a tool's
 * response, a contract's result, an HTTP response, typed entity reads and a
 * job's status. The runtime's own shell, registries and queue stay inside.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BusContract, BusResult } from "@brains/contracts";
import {
  Shell,
  createAIModelConfig,
  createShellConfig,
  createStandardConfig,
  type StandardConfig,
} from "@brains/core";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { JobInfo } from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import type { ToolResponse } from "@brains/mcp-service";
import { requestContract } from "@brains/messaging-service";
import {
  createEntityReader,
  instantiatePluginPackageDefinition,
  serviceJobStatus,
  type EntityReader,
  type Plugin,
  type ServiceJobDefinition,
  type ServiceJobStatus,
} from "@brains/plugins";
import { getHttpRouteSnapshot } from "@brains/plugins/internal/http-route-snapshot";
import { findHandlerRoute } from "@brains/plugins/internal/http-routes";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import {
  isConfiguredPluginDefinition,
  type ConfiguredPluginDefinition,
} from "@brains/sdk/internal/configured-plugin";
import { ConsoleLogger, LogLevel } from "@brains/utils/logger";
import { definedFields } from "@brains/utils/strip-undefined";
import type { z } from "@brains/utils/zod";
import { buildShellConfig, toAppConfig } from "../shell-config";
import { createCliOperatorContext } from "../cli-operator";
import {
  assertBrainPeerCompatibility,
  findPackageManifest,
} from "../installed-package-metadata";
import { MigrationManager } from "../migration-manager";
import {
  TEST_BRAIN_MODEL,
  createNoAIService,
  createNoEmbeddingService,
} from "./no-ai-provider";

/** What a test brain runs. */
export interface TestBrainOptions {
  /**
   * The packages the brain runs, each configured with `use()`, as
   * `defineBrain` takes them. They belong to the package under test: the
   * nearest `package.json` at or above the working directory names them, as
   * an installed package's manifest does, and its `@rizom/brain` peer range
   * must admit this brain.
   */
  readonly plugins: readonly ConfiguredPluginDefinition[];
}

/**
 * What a tool answered, as the brain's command line is told it: its output,
 * its failure in public form, or the approval it waits for.
 */
export type TestToolResult =
  | {
      readonly success: true;
      readonly data?: unknown;
      readonly message?: string | undefined;
    }
  | {
      readonly success: false;
      readonly error: string;
      readonly code?: string | undefined;
    }
  | {
      readonly needsConfirmation: true;
      readonly summary: string;
    };

/** A brain a test runs in its own process, on the runtime's own services. */
export interface TestBrain {
  /**
   * Call a tool by the name the brain gives it, as `brain tool` does: as the
   * brain's operator, an admin. A name no package declares is refused.
   */
  tool(name: string, input: unknown): Promise<TestToolResult>;
  /** Ask a request contract's owner, as the brain itself asks. */
  request<TRequest extends z.ZodType, TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, "request">,
    request: z.input<TRequest>,
  ): Promise<BusResult<z.output<TResponse>>>;
  /**
   * Serve a request as the brain's web server serves the routes its packages
   * declare. A path no package serves answers 404.
   */
  fetch(request: Request): Promise<Response>;
  /** Read what the brain stores, at every visibility. */
  readonly entities: EntityReader;
  readonly jobs: {
    /**
     * A job's status once it is neither running nor due: completed, failed,
     * or waiting to be retried after an attempt failed, its `code` saying
     * why. `null` when no package queued a job of that definition with
     * that id.
     */
    wait<TDefinition extends ServiceJobDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null>;
  };
  /** Stop the brain and delete what it stored. */
  stop(): Promise<void>;
}

/** Where the brain runs: the runtime's side, which a test does not choose. */
export interface TestBrainRuntime {
  /** The `@rizom/brain` version the package is held to. */
  readonly brainVersion: string;
  /** Where the package under test is found. */
  readonly directory: string;
  /** Where the brain's storage is made. Default: the system's temporary directory. */
  readonly temporaryRoot?: string | undefined;
}

/** The sender a request carries when the brain itself asks. */
const BRAIN_SENDER = "shell";

/** How often a waiting test looks at a job again. */
const JOB_POLL_INTERVAL_MS = 20;

function toTestToolResult(response: ToolResponse): TestToolResult {
  if ("needsConfirmation" in response) {
    return { needsConfirmation: true, summary: response.summary };
  }
  if (!response.success) {
    return {
      success: false,
      error: response.error,
      ...definedFields({ code: response.code }),
    };
  }
  return {
    success: true,
    ...definedFields({ data: response.data, message: response.message }),
  };
}

/** Neither running nor due: finished, or failed and not yet retried. */
function isSettled(job: JobInfo, now: number): boolean {
  if (job.status === "completed" || job.status === "failed") return true;
  return (
    job.status === "pending" && job.lastError !== null && job.scheduledFor > now
  );
}

function instantiate(
  plugins: readonly ConfiguredPluginDefinition[],
  metadata: { readonly name: string; readonly version: string },
): Plugin[] {
  return plugins.flatMap((configured) => {
    if (!isConfiguredPluginDefinition(configured)) {
      throw new Error(
        "A test brain runs packages configured with use(), as defineBrain does",
      );
    }
    return instantiatePluginPackageDefinition(
      configured.definition,
      configured.config,
      metadata,
    );
  });
}

export async function startTestBrain(
  options: TestBrainOptions,
  runtime: TestBrainRuntime,
): Promise<TestBrain> {
  const manifest = findPackageManifest(runtime.directory);
  assertBrainPeerCompatibility(manifest, runtime.brainVersion);
  const plugins = instantiate(options.plugins, {
    name: manifest.name,
    version: manifest.version,
  });

  const root = await mkdtemp(
    join(runtime.temporaryRoot ?? tmpdir(), "rizom-test-brain-"),
  );
  const storage = {
    ...createStandardConfig({
      dataDir: root,
      cacheDir: join(root, "cache"),
      distDir: join(root, "dist"),
    }),
    embedding: { enabled: false },
  };
  let shell: Shell;
  try {
    // The runtime's own migrations, run against this brain's storage only:
    // nothing is written beside the package.
    await new MigrationManager(
      ConsoleLogger.createFresh({
        level: LogLevel.WARN,
        context: "test-brain",
      }),
      {
        getStandardConfigWithDirectories: async (): Promise<StandardConfig> =>
          storage,
        migrateEntities,
        migrateJobQueue,
        migrateConversations,
        migrateRuntimeState,
      },
    ).runAllMigrations();
    const config = toAppConfig({
      name: manifest.name,
      version: manifest.version,
      logLevel: "warn",
      plugins,
      shellConfig: {
        ...storage,
        dataDir: join(root, "brain-data"),
        ai: { model: TEST_BRAIN_MODEL },
      },
    });
    const shellConfig = createShellConfig(buildShellConfig(config));
    shell = Shell.createFresh(shellConfig, {
      aiService: createNoAIService(createAIModelConfig(shellConfig)),
      embeddingService: createNoEmbeddingService(),
    });
    await shell.initialize();
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  const pluginIds = plugins.map((plugin) => plugin.id);
  let stopped: Promise<void> | undefined;
  const stop = async (): Promise<void> => {
    try {
      await shell.shutdown();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };

  return Object.freeze({
    async tool(name: string, input: unknown): Promise<TestToolResult> {
      const tools = shell.getMCPService().listTools();
      const match = tools.find(({ tool }) => tool.name === name);
      if (!match) {
        throw new Error(
          `No tool "${name}"; this brain has ${tools.map(({ tool }) => tool.name).join(", ")}`,
        );
      }
      return toTestToolResult(
        await match.tool.handler(input, createCliOperatorContext()),
      );
    },
    request: <TRequest extends z.ZodType, TResponse extends z.ZodType>(
      contract: BusContract<TRequest, TResponse, "request">,
      request: z.input<TRequest>,
    ): Promise<BusResult<z.output<TResponse>>> =>
      requestContract(shell.getMessageBus(), contract, request, BRAIN_SENDER),
    async fetch(request: Request): Promise<Response> {
      const route = findHandlerRoute(
        getHttpRouteSnapshot(shell),
        request.method.toUpperCase(),
        new URL(request.url).pathname,
      );
      if (!route) return new Response("Not Found", { status: 404 });
      // As the web server answers a route kept off the brain's shared host.
      if (route.sharedHostAdmission === "deny") {
        return new Response("Unauthorized", { status: 401 });
      }
      return route.handler(request);
    },
    entities: createEntityReader(shell.getEntityService(), "restricted"),
    jobs: Object.freeze({
      async wait<TDefinition extends ServiceJobDefinition>(
        definition: TDefinition,
        id: string,
      ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null> {
        const queue = shell.getJobQueueService();
        const settled = async (): Promise<JobInfo | null> => {
          const job = await queue.getStatus(id);
          if (
            !job ||
            !pluginIds.some(
              (pluginId) => job.type === `${pluginId}:${definition.name}`,
            )
          ) {
            return null;
          }
          if (isSettled(job, Date.now())) return job;
          await Bun.sleep(JOB_POLL_INTERVAL_MS);
          return settled();
        };
        const job = await settled();
        return job ? serviceJobStatus(definition, job) : null;
      },
    }),
    stop: (): Promise<void> => (stopped ??= stop()),
  });
}
