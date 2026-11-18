import { afterEach, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

/**
 * Runtime state a removed feature kept is deleted when the brain boots, so
 * no brain keeps dead rows: the use counts of the data-URL bridge.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const RETIRED_NAMESPACE = "shell.legacy-binary-content";

it("deletes the retired data-URL bridge counts when it boots", async () => {
  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  const { dir } = testDirectory;
  await Promise.all([
    migrateEntities({ url: `file:${dir}/test.db` }),
    migrateJobQueue({ url: `file:${dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${dir}/test-conv.db` }),
    migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` }),
  ]);
  // The rows an earlier release wrote, and one of a live namespace.
  const earlier = RuntimeStateService.createFresh(
    { url: `file:${dir}/test-runtime-state.db` },
    createSilentLogger("earlier-release"),
  );
  await earlier.initialize();
  const retired = earlier.scoped({
    namespace: RETIRED_NAMESPACE,
    schema: z.unknown(),
  });
  await retired.set("getEntityRaw:image", {
    method: "getEntityRaw",
    count: 31,
  });
  await retired.set("listEntities:document", { count: 2 });
  const live = earlier.scoped({ namespace: "shell.kept", schema: z.string() });
  await live.set("key", "value");
  earlier.close();

  const shell = Shell.createFresh(
    createTestShellConfig(dir),
    { logger: createSilentLogger("retired-runtime-state") },
    { processRole: "web" },
  );
  await shell.initialize();
  cleanups.push(() => shell.shutdown());

  const after = RuntimeStateService.createFresh(
    { url: `file:${dir}/test-runtime-state.db` },
    createSilentLogger("after-boot"),
  );
  await after.initialize();
  try {
    expect(
      await after
        .scoped({ namespace: RETIRED_NAMESPACE, schema: z.unknown() })
        .list(),
    ).toEqual([]);
    expect(
      await after
        .scoped({ namespace: "shell.kept", schema: z.string() })
        .get("key"),
    ).toBe("value");
  } finally {
    after.close();
  }
});
