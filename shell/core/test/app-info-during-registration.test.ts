import { afterEach, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
} from "@brains/plugins";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

/** Reads app info while registering, as an interface resolving its model does. */
function appInfoReader(): {
  plugins: Plugin[];
  read: { model?: string; embeddingModel?: string };
} {
  const read: { model?: string; embeddingModel?: string } = {};
  const plugins = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "app-info-reader",
      config: z.object({}),
      setup: async (context) => {
        const { ai } = await serviceRuntime(context).identity.getAppInfo();
        read.model = ai.model;
        read.embeddingModel = ai.embeddingModel;
        return {};
      },
    }),
    {},
    { name: "@test/app-info-reader", version: "1.0.0" },
  );
  return { plugins, read };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it("serves app info to a plugin while it registers", async () => {
  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  await Promise.all([
    migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
    migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
    migrateRuntimeState({
      url: `file:${testDirectory.dir}/test-runtime-state.db`,
    }),
  ]);
  const reader = appInfoReader();
  const config = createTestShellConfig(testDirectory.dir, {
    plugins: reader.plugins,
  });
  const shell = Shell.createFresh(
    config,
    { logger: createSilentLogger("app-info-during-registration") },
    { processRole: "web" },
  );
  cleanups.push(() => shell.shutdown());

  await shell.initialize();

  expect(reader.read.model).toBe(config.ai?.model);
  expect(reader.read.model).toBeString();
});

it("reports the configured embedding model", async () => {
  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  await Promise.all([
    migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
    migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
    migrateRuntimeState({
      url: `file:${testDirectory.dir}/test-runtime-state.db`,
    }),
  ]);
  const reader = appInfoReader();
  const config = createTestShellConfig(testDirectory.dir, {
    plugins: reader.plugins,
    ai: {
      model: "claude-haiku-4-5",
      providerKeys: {
        anthropic: "test-key",
        openai: "test-key",
        google: "test-key",
      },
      embeddingModel: "openai:text-embedding-3-large",
    },
  });
  const shell = Shell.createFresh(
    config,
    { logger: createSilentLogger("app-info-embedding-model") },
    { processRole: "web" },
  );
  cleanups.push(() => shell.shutdown());

  await shell.initialize();

  expect(reader.read.embeddingModel).toBe("openai:text-embedding-3-large");
});
