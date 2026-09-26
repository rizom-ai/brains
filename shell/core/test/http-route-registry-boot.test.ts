import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import type {
  Plugin,
  PluginCapabilities,
  WebRouteDefinition,
} from "@brains/plugins";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger } from "@brains/test-utils";
import type { BootMode } from "../src/initialization/shellBootloader";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellRuntimeOptions } from "../src/runtime-process-role";
import { createTestShellConfig } from "./helpers/test-config";
import { createTestDirectory } from "@brains/test-utils";

interface TestDirectory {
  dir: string;
  cleanup: () => Promise<void>;
}

interface BootCase {
  name: string;
  mode?: BootMode;
  runtimeOptions?: ShellRuntimeOptions;
}

const dependencies: Partial<ShellDependencies> = {
  logger: createSilentLogger("http-route-boot-test"),
  embeddingService: {
    dimensions: 1536,
    generateEmbedding: async () => ({
      embedding: new Float32Array(1536).fill(0.1),
      usage: { tokens: 1 },
    }),
    generateEmbeddings: async (texts: string[]) => ({
      embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
      usage: { tokens: texts.length },
    }),
  },
};

function routePlugin(
  id: string,
  path: string,
  onRead: () => void = (): void => {},
): Plugin {
  return {
    id,
    packageName: `@test/${id}`,
    type: "service",
    version: "1.0.0",
    register: async (): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
    getWebRoutes: (): WebRouteDefinition[] => {
      onRead();
      return [
        {
          path,
          public: true,
          handler: (): Response => new Response(id),
        },
      ];
    },
  };
}

function invalidRoutePlugin(): Plugin {
  return routePlugin("invalid-route", "/health/private");
}

describe("HTTP route finalization during shell boot", () => {
  let testDirectory: TestDirectory;
  let shell: Shell | undefined;

  beforeEach(async () => {
    testDirectory = await createTestDirectory();
    await Promise.all([
      migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDirectory.dir}/test-runtime-state.db`,
      }),
    ]);
  });

  afterEach(async () => {
    await shell?.shutdown();
    await testDirectory.cleanup();
  });

  const bootCases: BootCase[] = [
    { name: "register-only", mode: "register-only" },
    { name: "startup-check", mode: "startup-check" },
    { name: "normal" },
    { name: "worker", runtimeOptions: { processRole: "worker" } },
  ];

  it("fails boot on duplicate routes with both owners in the error", async () => {
    const config = createTestShellConfig(testDirectory.dir, {
      plugins: [
        routePlugin("first-owner", "/duplicate"),
        routePlugin("second-owner", "/duplicate"),
      ],
    });
    shell = Shell.createFresh(config, dependencies);

    let receivedError: unknown;
    try {
      await shell.initialize({ mode: "register-only" });
    } catch (error) {
      receivedError = error;
    }

    expect(String(receivedError)).toContain(
      'HTTP route conflict for GET /duplicate between plugins "first-owner" and "second-owner"; give one declaration a different method or path',
    );
  });

  it("publishes a finalized handler-free manifest", async () => {
    let getterReads = 0;
    const config = createTestShellConfig(testDirectory.dir, {
      plugins: [
        routePlugin("manifest-owner", "/manifest", () => {
          getterReads += 1;
        }),
      ],
    });
    shell = Shell.createFresh(config, dependencies);
    await shell.initialize({ mode: "register-only" });

    expect(getterReads).toBe(1);
    expect(shell.getPluginHttpRouteManifest()).toEqual([
      {
        ownerPluginId: "manifest-owner",
        kind: "handler",
        method: "GET",
        fullPath: "/manifest",
        match: "exact",
        sharedHostAdmission: "admit",
      },
    ]);
    expect(Object.isFrozen(shell.getPluginHttpRouteManifest())).toBe(true);
  });

  it("starts a runtime host for routes and releases its port on shutdown", async () => {
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        http: { port: 0, productionDistDir: `${testDirectory.dir}/production` },
        plugins: [routePlugin("host-owner", "/hello")],
      }),
      dependencies,
    );
    await shell.initialize();
    const url = shell.getHttpHostStatus()?.productionUrl;
    expect(url).toBeDefined();
    expect(await (await fetch(`${url}/hello`)).text()).toBe("host-owner");
    expect(shell.isHttpHostConfigured()).toBe(true);
    await shell.shutdown();
    expect(shell.getHttpHostStatus()?.running).toBe(false);
  });

  it("collects site output once and owns endpoint advertisements without a plugin", async () => {
    let reads = 0;
    const site: Plugin = {
      id: "site-writer",
      packageName: "@test/site-writer",
      type: "service",
      version: "1.0.0",
      register: async () => ({ tools: [], resources: [] }),
      getStaticSiteOutput: () => {
        reads += 1;
        return {
          productionOutputDir: `${testDirectory.dir}/production`,
          previewOutputDir: `${testDirectory.dir}/preview`,
          sharedImagesDir: `${testDirectory.dir}/images`,
        };
      },
    };
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        siteBaseUrl: "brain.example",
        http: { port: 0 },
        plugins: [site],
      }),
      dependencies,
    );
    await shell.initialize({ mode: "register-only" });
    expect(reads).toBe(1);
    expect(shell.isHttpHostConfigured()).toBe(true);
    expect(shell.listEndpoints()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: "runtime:http-host",
          label: "Site",
          url: "https://brain.example",
        }),
        expect.objectContaining({
          pluginId: "runtime:http-host",
          label: "Preview",
          visibility: "admin",
        }),
      ]),
    );
    expect(shell.listInteractions().map((entry) => entry.id)).toContain(
      "preview",
    );
    await shell.shutdown();
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("excludes hosting from eval execution even when routes remain", async () => {
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        executionMode: "eval",
        http: {
          port: 0,
          productionDistDir: `${testDirectory.dir}/not-created`,
        },
        plugins: [routePlugin("host-owner", "/hello")],
      }),
      dependencies,
    );
    await shell.initialize();
    expect(shell.getHttpHostStatus()?.running).toBe(false);
    expect(
      await Bun.file(`${testDirectory.dir}/not-created/index.html`).exists(),
    ).toBe(false);
    expect((await shell.getRuntimeReadiness()).checks).toContainEqual(
      expect.objectContaining({ name: "http-host", status: "healthy" }),
    );
  });

  it("keeps a routeless siteless runtime headless", async () => {
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir),
      dependencies,
    );
    await shell.initialize();
    expect(shell.isHttpHostConfigured()).toBe(false);
    expect(shell.getHttpHostStatus()?.running).toBe(false);
  });

  for (const bootCase of bootCases.filter((entry) => entry.name !== "normal")) {
    it(`does not listen in ${bootCase.name} even with static output and routes`, async () => {
      const output = `${testDirectory.dir}/not-created`;
      shell = Shell.createFresh(
        createTestShellConfig(testDirectory.dir, {
          http: { port: 0, productionDistDir: output },
          plugins: [routePlugin("host-owner", "/hello")],
        }),
        dependencies,
        bootCase.runtimeOptions,
      );
      await shell.initialize(
        bootCase.mode === undefined ? undefined : { mode: bootCase.mode },
      );
      expect(shell.getHttpHostStatus()?.running).toBe(false);
      expect(await Bun.file(`${output}/index.html`).exists()).toBe(false);
    });
  }

  it("releases the listener when a later boot hook fails", async () => {
    let url: string | undefined;
    const plugin = routePlugin("failure", "/hello");
    plugin.ready = async (): Promise<void> => {
      url = shell?.getHttpHostStatus()?.productionUrl;
      throw new Error("ready failed");
    };
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        http: { port: 0, productionDistDir: `${testDirectory.dir}/production` },
        plugins: [plugin],
      }),
      dependencies,
    );
    let failure: unknown;
    try {
      await shell.initialize();
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("ready failed");
    // Joining shutdown also joins failed boot and its rollback.
    await shell.shutdown();
    expect(url).toBeDefined();
    expect(shell.getHttpHostStatus()?.running).toBe(false);
    const rebound = Bun.serve({
      port: Number(new URL(url ?? "").port),
      fetch: (): Response => new Response("rebound"),
    });
    expect(await (await fetch(`${url}`)).text()).toBe("rebound");
    await rebound.stop(true);
  });

  for (const bootCase of bootCases) {
    it(`rejects invalid routes in ${bootCase.name} composition`, async () => {
      const config = createTestShellConfig(testDirectory.dir, {
        plugins: [invalidRoutePlugin()],
      });
      shell = Shell.createFresh(config, dependencies, bootCase.runtimeOptions);

      let receivedError: unknown;
      try {
        await shell.initialize(
          bootCase.mode === undefined ? undefined : { mode: bootCase.mode },
        );
      } catch (error) {
        receivedError = error;
      }

      expect(String(receivedError)).toContain(
        'Invalid HTTP route path "/health/private" declared by plugin "invalid-route"',
      );
      expect(shell.isInitialized()).toBe(false);
    });
  }
});
