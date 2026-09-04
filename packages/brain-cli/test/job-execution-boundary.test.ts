import { afterEach, describe, expect, it } from "bun:test";
import defaultSite from "@brains/site-default";
import {
  App,
  parseInstanceOverrides,
  registerPackage,
  resolve,
} from "@brains/app";
import { PROJECTION_RULE_JOB_TYPE } from "@brains/core";
import defaultTheme from "@rizom/theme-default";
import { startGitBrokerHost } from "@brains/directory-sync/broker-runtime";
import { createSilentLogger } from "@brains/test-utils";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalBrain } from "../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

interface BoundaryGitConfig {
  syncPath: string;
  seedContentPath: string;
  gitUrl: string;
  port: number;
}

function createFullPresetYaml(git?: BoundaryGitConfig): string {
  return `brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core, media, automation, web, chat, site, publishing, federation, team]
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
plugins:
  directory-sync:
    autoSync: false
    initialSync: ${git ? "true" : "false"}
    seedContent: false
${
  git
    ? `    entityTypes: [note]
    syncPath: ${JSON.stringify(git.syncPath)}
    seedContentPath: ${JSON.stringify(git.seedContentPath)}
    git:
      gitUrl: ${JSON.stringify(git.gitUrl)}
      branch: main
      authorName: Boundary Test
      authorEmail: boundary@example.com
      bootstrapFromSeed: true
  topics:
    enableAutoExtraction: false
  site-builder:
    autoRebuild: false
  webserver:
    productionPort: ${git.port}
`
    : ""
}`;
}

const fullPresetYaml = createFullPresetYaml();

function createFullPresetApp(
  dataDir: string,
  presetYaml = fullPresetYaml,
  gitBroker?: { socket: string; checkout: string },
): App {
  const config = resolve(
    canonicalBrain,
    { AI_API_KEY: "test-key" },
    parseInstanceOverrides(presetYaml),
  );
  return App.create({
    ...config,
    shellConfig: {
      ...config.shellConfig,
      database: { url: `file:${dataDir}/entities.db` },
      jobQueueDatabase: { url: `file:${dataDir}/jobs.db` },
      conversationDatabase: { url: `file:${dataDir}/conversations.db` },
      runtimeStateDatabase: { url: `file:${dataDir}/runtime-state.db` },
      embedding: { enabled: gitBroker === undefined },
      dataDir: `${dataDir}/content`,
      ...(gitBroker && {
        gitBrokerSocket: gitBroker.socket,
        gitBrokerCheckout: gitBroker.checkout,
      }),
      logging: { level: "error" },
    },
  });
}

type AppShell = ReturnType<App["getShell"]>;
type JobQueue = ReturnType<AppShell["getJobQueueService"]>;
type JobInfo = NonNullable<Awaited<ReturnType<JobQueue["getStatus"]>>>;

type JobHandler = NonNullable<ReturnType<JobQueue["getHandler"]>>;

function trackNextHandlerCompletion(
  queue: JobQueue,
  type: string,
): {
  next(): Promise<string>;
  restore(): void;
} {
  const handler: JobHandler | undefined = queue.getHandler(type);
  if (!handler) throw new Error(`Missing worker handler: ${type}`);
  const originalSuccess = handler.onTerminalSuccess?.bind(handler);
  const originalError = handler.onTerminalError?.bind(handler);
  let pending:
    | {
        resolve(jobId: string): void;
        reject(error: unknown): void;
      }
    | undefined;

  handler.onTerminalSuccess = async (
    data,
    jobId,
    progress,
    signal,
  ): Promise<void> => {
    try {
      if (originalSuccess) {
        await originalSuccess(data, jobId, progress, signal);
      }
      pending?.resolve(jobId);
    } catch (error) {
      pending?.reject(error);
      throw error;
    } finally {
      pending = undefined;
    }
  };
  handler.onTerminalError = async (
    error,
    data,
    jobId,
    progress,
    signal,
  ): Promise<void> => {
    try {
      if (originalError) {
        await originalError(error, data, jobId, progress, signal);
      }
    } finally {
      pending?.reject(error);
      pending = undefined;
    }
  };

  return {
    next: (): Promise<string> => {
      if (pending) throw new Error(`Already waiting for ${type}`);
      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    restore: (): void => {
      if (originalSuccess) handler.onTerminalSuccess = originalSuccess;
      else delete handler.onTerminalSuccess;
      if (originalError) handler.onTerminalError = originalError;
      else delete handler.onTerminalError;
    },
  };
}

function runGit(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function getAvailablePort(): Promise<number> {
  const server = Bun.serve({
    port: 0,
    fetch: (): Response => new Response(),
  });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a test port");
  return port;
}

async function expectCompletedJob(
  queue: JobQueue,
  completion: Promise<string>,
  expectedJobId?: string,
): Promise<JobInfo> {
  const completedJobId = await completion;
  if (expectedJobId && completedJobId !== expectedJobId) {
    throw new Error(
      `Expected job ${expectedJobId}, completed ${completedJobId}`,
    );
  }
  const job = await queue.getStatus(completedJobId);
  if (job?.status !== "completed") {
    throw new Error(
      `Job ${completedJobId} failed: ${job?.lastError ?? "missing terminal status"}`,
    );
  }
  return job;
}

describe("canonical durable job execution boundary", () => {
  const apps: App[] = [];
  const cleanups: Array<() => Promise<void>> = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0).reverse()) await app.stop();
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    for (const directory of directories.splice(0).reverse()) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("derives the exact worker inventory from immutable full-preset registrations", async () => {
    const webDirectory = await mkdtemp(join(tmpdir(), "brain-web-audit-"));
    const workerDirectory = await mkdtemp(
      join(tmpdir(), "brain-worker-audit-"),
    );
    directories.push(webDirectory, workerDirectory);

    const webApp = createFullPresetApp(webDirectory);
    apps.push(webApp);
    await webApp.migrate();
    await webApp.initialize(
      { mode: "register-only" },
      { migrationsCompleted: true, processRole: "web" },
    );

    const workerApp = createFullPresetApp(workerDirectory);
    apps.push(workerApp);
    await workerApp.migrate();
    await workerApp.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "worker",
    });

    const webQueue = webApp.getShell().getJobQueueService();
    const workerShell = workerApp.getShell();
    const workerQueue = workerShell.getJobQueueService();
    const webRegistrations = webQueue.getExecutionRegistrations();
    const workerRegistrations = workerQueue.getExecutionRegistrations();
    const webTypes = webRegistrations.map(({ type }) => type).sort();
    const workerTypes = workerRegistrations.map(({ type }) => type).sort();

    expect(workerTypes).toEqual([...webTypes, PROJECTION_RULE_JOB_TYPE].sort());
    expect(Object.isFrozen(workerRegistrations)).toBe(true);
    expect(workerRegistrations.every(Object.isFrozen)).toBe(true);
    expect(
      workerRegistrations.every(
        ({ type }) => workerQueue.getHandler(type) !== undefined,
      ),
    ).toBe(true);
    expect(workerShell.getMCPService().listTools()).toEqual([]);
    expect((await workerShell.getAppInfo()).daemons).toEqual([]);

    const configuredInterfaces = new Set(
      (
        resolve(
          canonicalBrain,
          { AI_API_KEY: "test-key" },
          parseInstanceOverrides(fullPresetYaml),
        ).plugins ?? []
      )
        .filter((plugin) => plugin.type === "interface")
        .map((plugin) => plugin.id),
    );
    expect(
      workerShell
        .getPluginManager()
        .getAllPluginIds()
        .filter((pluginId) => configuredInterfaces.has(pluginId)),
    ).toEqual([]);
  });

  it("executes directory-sync jobs through an endpoint-backed worker", async () => {
    const root = await mkdtemp(join(tmpdir(), "brain-owner-worker-"));
    directories.push(root);
    const dataDir = join(root, "content");
    const seedContentPath = join(root, "seed");
    const remotePath = join(root, "content.git");
    const editorPath = join(root, "editor");
    const gitBrokerSocket = join(root, "git-broker.sock");
    const databaseEndpoint = {
      address: join(root, "database-owner.sock"),
      secret: "s".repeat(48),
    };
    const gitUrl = pathToFileURL(remotePath).href;
    const gitConfig = {
      syncPath: dataDir,
      seedContentPath,
      gitUrl,
      port: await getAvailablePort(),
    };
    const presetYaml = createFullPresetYaml(gitConfig);
    const directorySyncConfig = {
      autoSync: false,
      initialSync: true,
      seedContent: false,
      entityTypes: ["note"],
      syncPath: dataDir,
      seedContentPath,
      git: {
        gitUrl,
        branch: "main",
        authorName: "Boundary Test",
        authorEmail: "boundary@example.com",
        bootstrapFromSeed: true,
      },
    };

    await mkdir(seedContentPath, { recursive: true });
    await writeFile(join(seedContentPath, ".gitkeep"), "");
    const gitBroker = await startGitBrokerHost({
      socketPath: gitBrokerSocket,
      cwd: root,
      dataDir,
      pluginConfig: directorySyncConfig,
      logger: createSilentLogger("owner-worker-git-broker"),
    });
    cleanups.push(() => gitBroker.stop());

    const ownerApp = createFullPresetApp(root, presetYaml, {
      socket: gitBrokerSocket,
      checkout: dataDir,
    });
    apps.push(ownerApp);
    await ownerApp.migrate();
    await ownerApp.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "web",
      localDatabaseEndpoint: {
        ...databaseEndpoint,
        sessionId: "owner-session",
      },
    });
    await ownerApp
      .getShell()
      .getEntityService()
      .createEntityFromMarkdown({
        input: {
          entityType: "note",
          id: "cleanup-orphan",
          markdown: "# Cleanup orphan\n\nNo file backs this entity.",
        },
        options: { persistenceOrigin: "directory-sync" },
      });

    const workerApp = createFullPresetApp(root, presetYaml, {
      socket: gitBrokerSocket,
      checkout: dataDir,
    });
    apps.push(workerApp);
    await workerApp.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "worker",
      localDatabaseEndpoint: {
        ...databaseEndpoint,
        sessionId: "worker-session",
      },
    });

    const ownerShell = ownerApp.getShell();
    const workerShell = workerApp.getShell();
    const ownerQueue = ownerShell.getJobQueueService();
    const workerQueue = workerShell.getJobQueueService();
    const ownerEntities = ownerShell.getEntityService();
    const workerEntities = workerShell.getEntityService();
    const syncRequestCompletions = trackNextHandlerCompletion(
      workerQueue,
      "directory-sync:sync-request",
    );
    const importCompletions = trackNextHandlerCompletion(
      workerQueue,
      "directory-sync:directory-import",
    );
    const deleteCompletions = trackNextHandlerCompletion(
      workerQueue,
      "directory-sync:directory-delete",
    );
    const cleanupCompletions = trackNextHandlerCompletion(
      workerQueue,
      "directory-sync:directory-cleanup",
    );
    cleanups.push(async () => {
      syncRequestCompletions.restore();
      importCompletions.restore();
      deleteCompletions.restore();
      cleanupCompletions.restore();
    });

    expect(workerShell.getPluginManager().getFailedPlugins()).toEqual([]);
    expect(workerQueue.getHandler("site-builder:site-build")).toBeDefined();
    let recentJobsError: unknown;
    try {
      await workerQueue.getRecentJobs();
    } catch (error) {
      recentJobsError = error;
    }
    if (!(recentJobsError instanceof Error)) {
      throw new Error("Worker getRecentJobs unexpectedly succeeded");
    }
    expect(recentJobsError.message).toBe("Job queue database is not local");

    runGit(root, ["clone", gitUrl, editorPath]);
    runGit(editorPath, ["config", "user.name", "Boundary Test"]);
    runGit(editorPath, ["config", "user.email", "boundary@example.com"]);
    await mkdir(join(editorPath, "note"), { recursive: true });
    await writeFile(
      join(editorPath, "note", "endpoint-boundary.md"),
      "# Endpoint boundary\n\nImported through the worker.\n",
    );
    runGit(editorPath, ["add", "."]);
    runGit(editorPath, ["commit", "-m", "add endpoint boundary fixture"]);
    runGit(editorPath, ["push", "origin", "main"]);

    const syncRequestCompletion = syncRequestCompletions.next();
    const importCompletion = importCompletions.next();
    const syncRequestId = await workerQueue.enqueue({
      type: "directory-sync:sync-request",
      data: { source: "owner-worker-boundary" },
    });
    const syncRequest = await expectCompletedJob(
      ownerQueue,
      syncRequestCompletion,
      syncRequestId,
    );
    const syncResult = syncRequest.result as {
      gitPulled?: unknown;
      batchQueued?: unknown;
      batchId?: unknown;
    };
    if (typeof syncResult.batchId !== "string") {
      throw new Error(
        `Sync request did not return a batch id: ${JSON.stringify(syncRequest.result)}`,
      );
    }
    expect(syncResult).toMatchObject({
      gitPulled: true,
      batchQueued: true,
      batchId: syncResult.batchId,
    });
    const importJob = await expectCompletedJob(ownerQueue, importCompletion);
    expect(importJob.metadata.rootJobId).toBe(syncResult.batchId);
    expect(
      await workerShell.jobs.getBatchStatus(syncResult.batchId),
    ).toMatchObject({
      status: "completed",
      failedOperations: 0,
      completedOperations: 1,
    });
    expect(
      await ownerEntities.getEntityRaw({
        entityType: "note",
        id: "endpoint-boundary",
        visibilityScope: "restricted",
      }),
    ).toMatchObject({ id: "endpoint-boundary", entityType: "note" });

    const deleteCompletion = deleteCompletions.next();
    const deleteId = await workerQueue.enqueue({
      type: "directory-sync:directory-delete",
      data: {
        entityId: "endpoint-boundary",
        entityType: "note",
        filePath: "note/endpoint-boundary.md",
      },
    });
    await expectCompletedJob(ownerQueue, deleteCompletion, deleteId);
    expect(
      await ownerEntities.getEntityRaw({
        entityType: "note",
        id: "endpoint-boundary",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
    await unlink(join(dataDir, "note", "endpoint-boundary.md"));

    expect(await workerEntities.hasPendingEntityExports()).toBe(false);
    const cleanupCompletion = cleanupCompletions.next();
    const cleanupId = await workerQueue.enqueue({
      type: "directory-sync:directory-cleanup",
      data: {},
    });
    await expectCompletedJob(ownerQueue, cleanupCompletion, cleanupId);
    expect(
      await ownerEntities.getEntityRaw({
        entityType: "note",
        id: "cleanup-orphan",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });
});
