import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabaseRpcClient, LocalDatabaseRpcServer } from "@brains/core";
import { JobQueueService, JOB_QUEUE_RPC_SERVICE } from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { createSilentLogger } from "@brains/test-utils";
import { isRecord } from "@brains/utils/is-record";
import { ImportBurstOwnerProbe } from "./helpers/import-burst-owner-probe";

const retire: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of retire.splice(0).reverse()) await close();
});

test("import-burst observer pages authenticated owner jobs and preserves deletion/terminal counts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ib-"));
  retire.push(() => rm(dir, { recursive: true, force: true }));
  const config = { url: `file:${join(dir, "jobs.db")}` };
  const logger = createSilentLogger();
  await migrateJobQueue(config, logger);
  const owner = JobQueueService.createFresh(config, logger, {
    handlerRegistrationMode: "validation-only",
  });
  retire.push(() => owner.closeAsync());
  await owner.initialize();
  const handler = {
    process: async (): Promise<void> => {},
    validateAndParse: (data: unknown): Record<string, unknown> | null =>
      isRecord(data) ? data : null,
  };
  owner.registerHandler("fixture:noise", handler);
  owner.registerHandler("directory-sync:directory-delete", handler);
  const endpoint = {
    address: join(dir, "owner.sock"),
    secret: randomBytes(32).toString("hex"),
    sessionId: randomUUID(),
  };
  const server = new LocalDatabaseRpcServer({ config: endpoint });
  retire.push(() => server.close());
  server.register(JOB_QUEUE_RPC_SERVICE, (payload) =>
    owner.handleRpcRequest(payload),
  );
  await server.initialize();
  const client = new LocalDatabaseRpcClient({
    config: { ...endpoint, sessionId: randomUUID() },
  });
  retire.push(async (): Promise<void> => {
    client.close();
  });
  await client.initialize();
  let updatePages = 0;
  const probe = new ImportBurstOwnerProbe({
    request: async (service, payload, options): Promise<unknown> => {
      if (isRecord(payload) && payload["operation"] === "getRuntimeUpdates") {
        updatePages++;
        expect(payload["limit"]).toBeLessThanOrEqual(32);
      }
      return client.request(service, payload, options);
    },
  });
  for (let index = 0; index < 34; index++) {
    const id = await owner.enqueue({ type: "fixture:noise", data: { index } });
    expect(await owner.complete(id, undefined)).toBe(true);
  }
  const ids: string[] = [];
  for (const [index, data] of [
    { deletions: ["a.md", "b.md"] },
    { path: "c.md" },
    { deletions: [] },
  ].entries()) {
    ids.push(
      await owner.enqueue({
        type: "directory-sync:directory-delete",
        data,
        idempotencyKey: `delete-${index}`,
        options: {
          maxRetries: 0,
          source: "import-burst-probe-test",
          metadata: { operationType: "data_processing" },
        },
      }),
    );
  }
  const first = ids[0];
  const second = ids[1];
  if (!first || !second) throw new Error("Expected delete jobs");
  // Pending jobs with updates occur in both the active set and update pages.
  expect(await owner.update(first, { deletions: ["a.md", "b.md"] })).toBe(true);
  expect(await probe.readQueuedDeletes(0)).toEqual({
    jobIds: ids,
    itemCount: 3,
  });
  expect(updatePages).toBeGreaterThan(1);
  expect(await probe.readQueuedDeletes(Date.now() + 1)).toEqual({
    jobIds: [],
    itemCount: 0,
  });
  const created = await owner.getStatus(first);
  if (!created) throw new Error("Expected persisted delete");
  expect((await probe.readQueuedDeletes(created.createdAt)).jobIds).toContain(
    first,
  );
  expect(await probe.countTerminalJobs([...ids, "missing"])).toBe(0);
  expect(await owner.complete(first, undefined)).toBe(true);
  expect(await owner.fail(second, new Error("Fixture terminal failure"))).toBe(
    true,
  );
  expect(await probe.countTerminalJobs([...ids, "missing"])).toBe(2);
  // Completed/failed deletes remain in the durable observation, not just pending jobs.
  expect(await probe.readQueuedDeletes(0)).toEqual({
    jobIds: ids,
    itemCount: 3,
  });
  client.close();
  await assert.rejects(probe.countTerminalJobs(ids));
});
