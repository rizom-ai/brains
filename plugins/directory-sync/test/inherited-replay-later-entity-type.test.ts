import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EntityRegistry,
  EntityService,
  baseEntitySchema,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createTestEntity } from "@brains/entity-service/test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { MockEntityAdapter } from "./fixtures";
import { createDirectorySyncPlugin } from "./directory-sync-plugins";
import { BrokerConnection } from "../src/lib/broker/client";
import { startGitBrokerHost } from "../src/lib/broker/host";
import { gitBrokerSocketPath } from "../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../src/lib/git-options";
import { runGit } from "./git/real-git";

/**
 * A restarted brain reconciles what the previous broker generation left
 * while directory-sync registers, before the plugins composed after it have
 * registered their entity types. A file of such a type in that delta, whose
 * entity is already stored, is left for the startup sync to import; the
 * replay must not read the stored entity through a type it cannot parse.
 */

const CHECKPOINT_NAMESPACE = "directory-sync.git-reconciliation";

const embeddingService = {
  identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
  embedQuery: async (): Promise<never> => {
    throw new Error("Unexpected embedding");
  },
  embedDocuments: async (): Promise<never> => {
    throw new Error("Unexpected embedding");
  },
};

function openEntityService(
  root: string,
  types: string[],
  logger: Logger = createSilentLogger(),
): { service: EntityService; registry: EntityRegistry } {
  const registry = EntityRegistry.createFresh(logger);
  for (const type of types) {
    registry.registerEntityType(
      type,
      baseEntitySchema,
      new MockEntityAdapter(type),
    );
  }
  const service = EntityService.createFresh({
    dbConfig: { url: `file:${root}/entities.db` },
    embeddingDbConfig: { url: `file:${root}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService,
  });
  return { service, registry };
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await runGit(["add", "."], cwd);
  const identity = [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
  ];
  await runGit([...identity, "commit", "-m", message], cwd);
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("inherited-work replay before later plugins register", () => {
  it("leaves a stored entity of a later type to the startup sync without failing to parse it", async () => {
    const root = mkdtempSync(join(tmpdir(), "test-inherited-later-type-"));
    cleanups.push(async () => rmSync(root, { recursive: true, force: true }));
    const remote = join(root, "remote.git");
    const seedClone = join(root, "seed");
    const checkout = join(root, "checkout");
    const socketPath = gitBrokerSocketPath(join(root, "runtime"));
    const gitUrl = `file://${remote}`;
    const remoteFingerprint = getGitRemoteFingerprint(gitUrl);

    // An offline remote holding one note.
    await runGit(["init", "--bare", "-b", "main", remote], root);
    await runGit(["clone", remote, seedClone], root);
    mkdirSync(join(seedClone, "note"), { recursive: true });
    writeFileSync(join(seedClone, "note", "a.md"), "A note\n");
    await commitAll(seedClone, "base");
    await runGit(["push", "origin", "HEAD:main"], seedClone);

    const pluginConfig = {
      syncPath: checkout,
      autoSync: false,
      initialSync: true,
      git: {
        gitUrl,
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
        bootstrapFromSeed: false,
      },
    };
    const hostOptions = {
      socketPath,
      cwd: root,
      dataDir: checkout,
      pluginConfig,
      logger: createSilentLogger(),
    };

    // The previous generation clones the checkout and goes away, so the
    // next owner inherits it and holds mutations until a role reconciles.
    const previous = await startGitBrokerHost(hostOptions);
    const seed = await BrokerConnection.connect(socketPath);
    await seed.registerCheckout({
      checkoutPath: checkout,
      branch: "main",
      remoteFingerprint,
    });
    await seed.execute(checkout, { name: "initialize" });
    seed.close();
    await previous.stop();
    const base = (await runGit(["rev-parse", "HEAD"], checkout)).trim();

    // A hand-made, unpushed commit adds a file of a type a later plugin
    // registers, whose entity the brain already stores.
    mkdirSync(join(checkout, "widget"), { recursive: true });
    writeFileSync(join(checkout, "widget", "legacy.md"), "Widget v2\n");
    await commitAll(checkout, "hand-made");

    await migrateEntities(
      { url: `file:${root}/entities.db` },
      createSilentLogger(),
    );
    const earlier = openEntityService(root, ["note", "widget"]);
    await earlier.service.initialize();
    await earlier.service.createEntity({
      entity: createTestEntity("widget", {
        id: "legacy",
        content: "Widget v1\n",
      }),
    });
    earlier.service.close();

    // directory-sync registers before the widget plugin: only `note` exists.
    const logger = createMockLogger();
    const current = openEntityService(root, ["note"], logger);
    await current.service.initialize();
    cleanups.push(async () => current.service.close());
    const shell = createMockShell({
      logger,
      entityService: current.service,
      dataDir: checkout,
      gitBrokerSocket: socketPath,
      gitBrokerCheckout: checkout,
    });
    const checkpoints = shell.getRuntimeState().scoped<unknown>({
      namespace: CHECKPOINT_NAMESPACE,
      schema: z.unknown(),
    });
    await checkpoints.set("current", {
      checkpoint: {
        remoteFingerprint,
        branch: "main",
        lastReconciledGitHead: base,
        lastObservedRemoteHead: base,
      },
      entityTypes: ["note", "widget"],
    });

    const owner = await startGitBrokerHost(hostOptions);
    cleanups.push(() => owner.stop());
    const plugin = createDirectorySyncPlugin(pluginConfig);
    await plugin.register(shell);
    cleanups.push(() => plugin.shutdown());

    const status = await BrokerConnection.connect(socketPath);
    expect((await status.status()).admitsMutations).toBe(true);
    status.close();
    expect(logger.warn).toHaveBeenCalledWith(
      "Git owner is holding mutations; reconciling inherited work",
    );
    expect(logger.error).not.toHaveBeenCalled();
    // Nothing of the later type could be queued yet, so the checkpoint
    // stays where the delta still lists the file.
    expect(await checkpoints.get("current")).toMatchObject({
      checkpoint: { lastReconciledGitHead: base },
    });

    // The later plugin registers its type, then the startup sync runs.
    current.registry.registerEntityType(
      "widget",
      baseEntitySchema,
      new MockEntityAdapter("widget"),
    );
    await plugin.ready();
    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
    });

    const imports = (await shell.getJobQueueService().getActiveJobs()).filter(
      (job) => job.type === "directory-sync:directory-import",
    );
    const plans = imports.flatMap(
      (job) =>
        z
          .object({
            plan: z.array(
              z.object({
                path: z.string(),
                expectedRevision: z.string().nullable(),
              }),
            ),
          })
          .parse(JSON.parse(job.data)).plan,
    );
    expect(plans.find((entry) => entry.path === "widget/legacy.md")).toEqual({
      path: "widget/legacy.md",
      expectedRevision: expect.any(String),
    });
    const head = (await runGit(["rev-parse", "HEAD"], checkout)).trim();
    expect(await checkpoints.get("current")).toMatchObject({
      checkpoint: { lastReconciledGitHead: head },
      entityTypes: ["note", "widget"],
    });
    expect(head).not.toBe(base);
    expect(logger.error).not.toHaveBeenCalled();
  }, 60_000);
});
