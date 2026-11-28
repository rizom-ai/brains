import { spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import conflictPackage from "@brains/conflict";
import {
  EntityRegistry,
  EntityService,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";
import documentPackage from "@brains/document-plugin";
import imagePackage from "@brains/image-plugin";
import notePackage from "@brains/note";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginPackageDefinition,
} from "@brains/plugins";
import {
  createMockAuthBackend,
  createMockMessageBus,
  createMockShell,
  isDeclaredEntityType,
  registerAll,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import webdavPackage from "@brains/webdav";
import type { HttpFetch } from "..";

/** The app passwords the test brain knows. */
export const PASSWORD = "write-password";
export const READ_ONLY_PASSWORD = "read-password";
export const USERNAME = "dav-test";

export interface TestBrain {
  service: EntityService;
  /** Requests to the brain's drive, answered in process. */
  fetch: HttpFetch;
  /** Every request the drive answered, as `METHOD path`. */
  requests: string[];
  /** When false, the brain cannot be reached. */
  online: boolean;
  get(type: string, id: string): Promise<BaseEntity | null>;
  /** Write an entry as Studio or chat would: a change made in the brain. */
  write(type: string, id: string, content: string): Promise<void>;
  remove(type: string, id: string): Promise<void>;
  conflicts(): Promise<BaseEntity[]>;
  close(): Promise<void>;
}

function plugins(
  definition: PluginPackageDefinition,
  name: string,
  pluginId: string,
  only?: (plugin: Plugin) => boolean,
): Plugin[] {
  return instantiatePluginPackageDefinition(
    definition,
    {},
    { name, version: "0.0.0-test" },
    { pluginId },
  ).filter((plugin) => only?.(plugin) ?? true);
}

/**
 * A brain as the plugin meets it: the real note, image and conflict
 * packages and the real drive, wired by the shell over an entity store on
 * disk. Requests reach the drive's routes in process.
 */
export async function openBrain(): Promise<TestBrain> {
  const directory = mkdtempSync(join(tmpdir(), "obsidian-plugin-brain-"));
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${directory}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  // One bus for the store and the shell, so the drive hears every change.
  const messageBus = createMockMessageBus();
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    messageBus,
    embeddingsEnabled: false,
    embeddingService: createRefusingEmbeddingService(),
  });
  const shell = createMockShell({
    entityService: service,
    dataDir: directory,
    messageBus,
  });
  spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
  shell.getAuthRegistry().bindBackend(
    createMockAuthBackend({
      recordAuditEvent: async (event) => ({
        ...event,
        id: `audit-${event.action}`,
        createdAt: 0,
      }),
      resolveAppPassword: async (request) => {
        const header = request.headers.get("authorization") ?? "";
        const [user, password] = atob(header.replace(/^Basic /, "")).split(":");
        if (user !== USERNAME) return undefined;
        if (password !== PASSWORD && password !== READ_ONLY_PASSWORD) {
          return undefined;
        }
        return {
          principal: {
            userId: "usr_writer",
            personId: "prsn_writer",
            displayName: "Writer",
            role: "admin",
            status: "active",
            permissionLevel: "admin",
            isAnchor: false,
          },
          access: password === PASSWORD ? "write" : "read",
          appPasswordId: "pw_obsidian",
        };
      },
    }),
  );

  const installed = [
    ...plugins(notePackage, "@brains/note", "note", isDeclaredEntityType),
    ...plugins(
      imagePackage,
      "@brains/image-plugin",
      "image",
      isDeclaredEntityType,
    ),
    ...plugins(
      documentPackage,
      "@brains/document-plugin",
      "document",
      isDeclaredEntityType,
    ),
    ...plugins(conflictPackage, "@brains/conflict", "conflicts"),
    ...plugins(webdavPackage, "@brains/webdav", "webdav"),
  ];
  await registerAll(shell, installed);
  await service.initialize();
  for (const plugin of installed) await plugin.finalizeRegistration?.();
  const routes = installed.flatMap((plugin) => plugin.getWebRoutes?.() ?? []);

  const brain: TestBrain = {
    service,
    requests: [],
    online: true,
    fetch: async (request) => {
      if (!brain.online) throw new Error("connect ECONNREFUSED");
      const route = routes.find(
        (candidate) => candidate.method === request.method,
      );
      if (!route) throw new Error(`The drive has no ${request.method} route`);
      brain.requests.push(
        `${request.method} ${decodeURIComponent(new URL(request.url).pathname)}`,
      );
      // A crash inside the brain is a 500, as a real server answers it.
      const response = await Promise.resolve(
        route.handler(
          new Request(request.url, {
            method: request.method,
            headers: request.headers,
            ...(request.body !== undefined && {
              body: new Uint8Array(request.body),
            }),
          }),
        ),
      ).catch((error: unknown) => new Response(String(error), { status: 500 }));
      return {
        status: response.status,
        headers: Object.fromEntries(
          [...response.headers.entries()].map(([name, value]) => [
            name.toLowerCase(),
            value,
          ]),
        ),
        body: new Uint8Array(await response.arrayBuffer()),
      };
    },
    // The stored text, as the drive serves it: image references unresolved.
    get: (type, id) =>
      service.getEntityRaw({
        entityType: type,
        id,
        visibilityScope: "restricted",
      }),
    write: async (type, id, content) => {
      const current = await brain.get(type, id);
      if (current) {
        await service.updateEntity({ entity: { ...current, content } });
      } else {
        await service.createEntity({
          entity: { id, entityType: type, content, metadata: {} },
        });
      }
    },
    remove: async (type, id) => {
      await service.deleteEntity({ entityType: type, id });
    },
    conflicts: () =>
      service.listEntities({
        entityType: "conflict",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    close: async () => {
      service.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
  return brain;
}
