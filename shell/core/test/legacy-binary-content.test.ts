import { afterEach, expect, it } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { baseEntitySchema } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createTestEntity,
  createTestEntityAdapter,
} from "@brains/entity-service/test";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function bootShell(dir: string): Promise<Shell> {
  const shell = Shell.createFresh(
    createTestShellConfig(dir),
    { logger: createSilentLogger("legacy-binary-content") },
    { processRole: "web" },
  );
  shell
    .getEntityRegistry()
    .registerEntityType(
      "picture",
      baseEntitySchema,
      createTestEntityAdapter("picture"),
      { binaryStorage: "asset", embeddable: false, fullTextSearchable: false },
    );
  await shell.initialize();
  return shell;
}

it("reports legacy binary reads by surface and type, kept across a restart", async () => {
  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  const { dir } = testDirectory;
  await Promise.all([
    migrateEntities({ url: `file:${dir}/test.db` }),
    migrateJobQueue({ url: `file:${dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${dir}/test-conv.db` }),
    migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` }),
  ]);

  const first = await bootShell(dir);
  const entityService = first.getEntityService();
  const asset = await entityService.stageAsset(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
  );
  await entityService.createEntity({
    entity: createTestEntity("picture", {
      id: "cover",
      content: asset.ref,
      metadata: { mediaType: "image/png" },
    }),
    stagedAsset: asset,
  });
  await entityService.getEntityRaw({ entityType: "picture", id: "cover" });

  const reported = (await first.getAppInfo()).legacyBinaryContent;
  expect(reported).toEqual([
    {
      method: "getEntityRaw",
      entityType: "picture",
      count: 1,
      firstAt: expect.any(String),
      lastAt: expect.any(String),
    },
  ]);
  expect(JSON.stringify(reported)).not.toContain("cover");

  await entityService.listEntities({ entityType: "picture" });
  await first.shutdown();

  const second = await bootShell(dir);
  cleanups.push(() => second.shutdown());
  expect(
    (await second.getAppInfo()).legacyBinaryContent.map(({ method, count }) => [
      method,
      count,
    ]),
  ).toEqual([
    ["getEntityRaw", 1],
    ["listEntities", 1],
  ]);
});
