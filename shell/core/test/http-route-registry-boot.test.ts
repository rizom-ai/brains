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
      'HTTP route conflict for GET /duplicate between plugins "first-owner" and "second-owner"',
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
