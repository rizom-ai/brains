import { afterEach, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { ServicePlugin, type ServicePluginContext } from "@brains/plugins";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

/** Reads app info while registering, as an interface resolving its model does. */
class AppInfoReader extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  public model: string | undefined;

  public constructor() {
    super(
      "app-info-reader",
      { name: "@test/app-info-reader", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.model = (await context.identity.getAppInfo()).ai.model;
  }
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
  const reader = new AppInfoReader();
  const config = createTestShellConfig(testDirectory.dir, {
    plugins: [reader],
  });
  const shell = Shell.createFresh(
    config,
    { logger: createSilentLogger("app-info-during-registration") },
    { processRole: "web" },
  );
  cleanups.push(() => shell.shutdown());

  await shell.initialize();

  expect(reader.model).toBe(config.ai?.model);
  expect(reader.model).toBeString();
});
