import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabaseRpcClient, LocalDatabaseRpcServer } from "@brains/core";
import {
  JobQueueService,
  JOB_QUEUE_RPC_SERVICE,
  parseJobQueueRpcRequest,
  type JobHandler,
} from "@brains/job-queue";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { createSilentLogger } from "@brains/test-utils";
import { isRecord } from "@brains/utils/is-record";
import { ImportClaimHold, IMPORT_JOB_TYPE } from "./helpers/import-claim-hold";
import {
  ImportHoldController,
  startImportHoldControl,
} from "./helpers/import-hold-runtime";
import { ImportBurstOwnerProbe } from "./helpers/import-burst-owner-probe";

const DELETE_JOB_TYPE = "directory-sync:directory-delete";
const SYNC_JOB_TYPE = "directory-sync:directory-sync";
const handler: JobHandler = {
  process: async (): Promise<void> => {},
  validateAndParse: (data: unknown): Record<string, unknown> | null =>
    isRecord(data) ? data : null,
};
const retire: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of retire.splice(0).reverse()) await close();
});

interface ClaimFixture {
  owner: JobQueueService;
  borrowers: Array<{
    queue: JobQueueService;
    hold: ImportClaimHold;
    databasePath: string;
    client: LocalDatabaseRpcClient;
  }>;
  loseNextClaimReply(): void;
  gateNext(operation: "dequeue" | "getActiveJobs"): {
    entered: Promise<void>;
    release(): void;
  };
}
async function fixture(): Promise<ClaimFixture> {
  const dir = await mkdtemp(join(tmpdir(), "ih-"));
  retire.push(() => rm(dir, { recursive: true, force: true }));
  const logger = createSilentLogger();
  const config = { url: `file:${join(dir, "owner.db")}` };
  await migrateJobQueue(config, logger);
  const owner = JobQueueService.createFresh(config, logger, {
    handlerRegistrationMode: "validation-only",
  });
  retire.push(() => owner.closeAsync());
  await owner.initialize();
  for (const type of [IMPORT_JOB_TYPE, DELETE_JOB_TYPE, SYNC_JOB_TYPE])
    owner.registerHandler(type, handler, "directory-sync");
  const endpoint = {
    address: join(dir, "owner.sock"),
    secret: randomBytes(32).toString("hex"),
    sessionId: randomUUID(),
  };
  const server = new LocalDatabaseRpcServer({ config: endpoint });
  retire.push(() => server.close());
  let gate:
    | {
        operation: string;
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  server.register(JOB_QUEUE_RPC_SERVICE, async (payload): Promise<unknown> => {
    const request = parseJobQueueRpcRequest(payload);
    if (gate?.operation === request.operation) {
      const captured = gate;
      gate = undefined;
      captured.entered.resolve();
      await captured.release.promise;
    }
    return owner.handleRpcRequest(request);
  });
  await server.initialize();
  const borrowers: ClaimFixture["borrowers"] = [];
  let loseClaimReply = false;
  for (let index = 0; index < 2; index++) {
    const client = new LocalDatabaseRpcClient({
      config: { ...endpoint, sessionId: randomUUID() },
    });
    const databasePath = join(dir, `never-opened-${index}.db`);
    const queue = JobQueueService.createFresh(
      { url: `file:${databasePath}` },
      logger,
      {
        handlerRegistrationMode: "execution-only",
        remoteTransport: {
          initialize: () => client.initialize(),
          close: () => client.close(),
          request: async (payload): Promise<unknown> => {
            const result = await client.request(JOB_QUEUE_RPC_SERVICE, payload);
            if (loseClaimReply && payload.operation === "dequeue") {
              loseClaimReply = false;
              throw new Error(
                "Lost claim receipt after real owner acknowledgement",
              );
            }
            return result;
          },
        },
      },
    );
    retire.push(() => queue.closeAsync());
    await queue.initialize();
    for (const type of [IMPORT_JOB_TYPE, DELETE_JOB_TYPE, SYNC_JOB_TYPE])
      queue.registerHandler(type, handler, "directory-sync");
    queue.finalizeHandlerRegistrations();
    const hold = new ImportClaimHold(queue);
    retire.push(() => hold.close());
    borrowers.push({ queue, hold, databasePath, client });
  }
  return {
    owner,
    borrowers,
    loseNextClaimReply: (): void => {
      loseClaimReply = true;
    },
    gateNext: (operation): ReturnType<ClaimFixture["gateNext"]> => {
      if (gate) throw new Error("A request gate is already armed");
      const next = {
        operation,
        entered: Promise.withResolvers<void>(),
        release: Promise.withResolvers<void>(),
      };
      gate = next;
      return {
        entered: next.entered.promise,
        release: () => next.release.resolve(),
      };
    },
  };
}

function firstBorrower(value: ClaimFixture): ClaimFixture["borrowers"][number] {
  const first = value.borrowers[0];
  assert(first);
  return first;
}

test("selective holds preserve due imports while authenticated borrowers claim delete and sync work", async () => {
  const runtime = await fixture();
  const declarations = runtime.borrowers.map(({ queue }) =>
    queue.getExecutionRegistrations(),
  );
  expect(
    await Promise.all(runtime.borrowers.map(({ hold }) => hold.hold())),
  ).toEqual([true, true]);
  const importId = await runtime.owner.enqueue({
    type: IMPORT_JOB_TYPE,
    data: { paths: ["a.md"] },
  });
  const before = await runtime.owner.getStatus(importId);
  expect(before).toMatchObject({ status: "pending", retryCount: 0 });
  const deleteId = await runtime.owner.enqueue({
    type: DELETE_JOB_TYPE,
    data: { deletions: ["a.md"] },
  });
  const syncId = await runtime.owner.enqueue({
    type: SYNC_JOB_TYPE,
    data: { source: "fixture" },
  });
  const { queue } = firstBorrower(runtime);
  const deletion = await queue.dequeue();
  assert(deletion?.attemptId);
  expect(deletion.id).toBe(deleteId);
  expect(await queue.complete(deleteId, undefined, deletion.attemptId)).toBe(
    true,
  );
  const other = runtime.borrowers[1];
  assert(other);
  const sync = await other.queue.dequeue();
  assert(sync?.attemptId);
  expect(sync.id).toBe(syncId);
  expect(await other.queue.complete(syncId, undefined, sync.attemptId)).toBe(
    true,
  );
  for (const borrower of runtime.borrowers) {
    expect(await borrower.queue.dequeue()).toBeNull();
    expect(await Bun.file(borrower.databasePath).exists()).toBe(false);
  }
  expect(await runtime.owner.getStatus(importId)).toEqual(before);
  expect(await runtime.owner.getDiagnostics(Date.now())).toMatchObject({
    duePending: 1,
  });
  for (const { hold } of runtime.borrowers) hold.release();
  expect(
    runtime.borrowers.map(({ queue }) => queue.getExecutionRegistrations()),
  ).toEqual(declarations);
  for (const { queue } of runtime.borrowers)
    expect(() => queue.registerHandler("fixture:late", handler)).toThrow(
      "finalized",
    );
  const imported = await queue.dequeue();
  assert(imported?.attemptId);
  expect(imported.id).toBe(importId);
  expect(await queue.complete(importId, undefined, imported.attemptId)).toBe(
    true,
  );
  expect(await runtime.owner.getStats()).toMatchObject({
    pending: 0,
    processing: 0,
    completed: 3,
    failed: 0,
  });
});

test("hold joins an already-advertised claim and withholds acknowledgement until its import settles", async () => {
  const runtime = await fixture();
  const { queue, hold } = firstBorrower(runtime);
  const id = await runtime.owner.enqueue({
    type: IMPORT_JOB_TYPE,
    data: { paths: ["late.md"] },
  });
  const gate = runtime.gateNext("dequeue");
  const claiming = queue.dequeue();
  await gate.entered;
  let settled = false;
  const holding = hold.hold().then((ready): boolean => {
    settled = true;
    return ready;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(queue.getHandler(IMPORT_JOB_TYPE)).toBe(handler);
    expect(settled).toBe(false);
    expect(() => hold.release()).toThrow("not quiesced");
  } finally {
    gate.release();
    await claiming;
  }
  expect(await holding).toBe(false);
  const claimed = await claiming;
  assert(claimed?.attemptId);
  expect(claimed.id).toBe(id);
  expect(await hold.hold()).toBe(false);
  expect(await queue.complete(id, undefined, claimed.attemptId)).toBe(true);
  expect(await hold.hold()).toBe(true);
  hold.release();
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBe(handler);
});

test("retirement joins a pending owner read, rejects stale calls and does not revive imports", async () => {
  const runtime = await fixture();
  const { queue, hold } = firstBorrower(runtime);
  const staleDequeue = queue.dequeue;
  const gate = runtime.gateNext("getActiveJobs");
  const rejected = assert.rejects(hold.hold(), /closed/);
  await gate.entered;
  let closed = false;
  const closing = hold.close().then((): void => {
    closed = true;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
  } finally {
    gate.release();
    await Promise.all([closing, rejected]);
  }
  expect(closed).toBe(true);
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBeUndefined();
  expect(queue.getHandler(DELETE_JOB_TYPE)).toBe(handler);
  expect(queue.dequeue).not.toBe(staleDequeue);
  await assert.rejects(staleDequeue(), /closed/);
  await assert.rejects(hold.hold(), /closed/);
  expect(() => hold.release()).toThrow("closed");
  await hold.close();
});

test("a lost claim receipt fences hold acknowledgement even when a later owner read is empty", async () => {
  const runtime = await fixture();
  const { queue, hold } = firstBorrower(runtime);
  runtime.loseNextClaimReply();
  await assert.rejects(queue.dequeue(), /Lost claim receipt/);
  expect(await runtime.owner.getActiveJobs([IMPORT_JOB_TYPE])).toEqual([]);
  await assert.rejects(hold.hold(), /uncertain/);
  await assert.rejects(hold.hold(), /uncertain/);
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBe(handler);
  expect(() => hold.release()).toThrow("uncertain");
  expect(await runtime.owner.getStats()).toMatchObject({ total: 0 });
});

test("authenticated fixture control holds and releases native imports and retires its endpoint", async () => {
  const runtime = await fixture();
  const { queue, hold, client } = firstBorrower(runtime);
  const directory = await mkdtemp(join(tmpdir(), "ih-control-"));
  retire.push(() => rm(directory, { recursive: true, force: true }));
  const secret = randomBytes(32).toString("hex");
  const control = await startImportHoldControl(hold, directory, secret);
  retire.push(() => control.close());
  const controller = new ImportHoldController(
    directory,
    secret,
    [process.pid],
    1000,
  );
  const unauthorized = new ImportHoldController(
    directory,
    randomBytes(32).toString("hex"),
    [process.pid],
    1000,
  );
  await assert.rejects(unauthorized.arm(), /403/);
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBe(handler);
  const probe = new ImportBurstOwnerProbe(client);
  expect(await probe.hasActiveImports()).toBe(false);
  expect(await controller.arm()).toBe(true);
  const id = await runtime.owner.enqueue({
    type: IMPORT_JOB_TYPE,
    data: { paths: ["one.md", "two.md"] },
  });
  const snapshot = await runtime.owner.getStatus(id);
  expect(await probe.hasActiveImports()).toBe(true);
  expect(await probe.readHeldImports()).toEqual({ jobIds: [id], itemCount: 2 });
  expect(await queue.dequeue()).toBeNull();
  expect(await runtime.owner.getStatus(id)).toEqual(snapshot);
  await controller.release();
  const claimed = await queue.dequeue();
  assert(claimed?.attemptId);
  expect(claimed.id).toBe(id);
  expect(await queue.complete(id, undefined, claimed.attemptId)).toBe(true);
  const laterId = await runtime.owner.enqueue({
    type: IMPORT_JOB_TYPE,
    data: { paths: ["after-release.md"] },
  });
  const later = await queue.dequeue();
  assert(later?.attemptId);
  expect(later.id).toBe(laterId);
  expect(await queue.complete(laterId, undefined, later.attemptId)).toBe(true);
  expect(await probe.hasActiveImports()).toBe(false);
  expect(await probe.readHeldImports()).toEqual({ jobIds: [], itemCount: 0 });
  await control.close();
  await assert.rejects(controller.arm(), /ENOENT/);
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBeUndefined();
});

test("control publication failure retires the installed dequeue seam", async () => {
  const runtime = await fixture();
  const { queue, hold } = firstBorrower(runtime);
  const installed = queue.dequeue;
  const root = await mkdtemp(join(tmpdir(), "ih-failure-"));
  retire.push(() => rm(root, { recursive: true, force: true }));
  const blocker = join(root, "not-a-directory");
  await writeFile(blocker, "preserve this file");
  await assert.rejects(
    startImportHoldControl(hold, blocker, randomBytes(32).toString("hex")),
    AggregateError,
  );
  expect(queue.dequeue).not.toBe(installed);
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBeUndefined();
  expect(await Bun.file(blocker).text()).toBe("preserve this file");
});

test("dequeue exclusions are bounded and cannot bypass finalized execution declarations", async () => {
  const runtime = await fixture();
  const { queue } = firstBorrower(runtime);
  const id = await runtime.owner.enqueue({
    type: IMPORT_JOB_TYPE,
    data: { paths: ["excluded.md"] },
  });
  await assert.rejects(
    queue.dequeue(
      undefined,
      Array.from({ length: 257 }, () => IMPORT_JOB_TYPE),
    ),
  );
  await assert.rejects(queue.dequeue(undefined, [""]));
  expect(await queue.dequeue(undefined, [IMPORT_JOB_TYPE])).toBeNull();
  expect(await runtime.owner.getStatus(id)).toMatchObject({
    status: "pending",
    retryCount: 0,
  });
  const claimed = await queue.dequeue(undefined, ["fixture:unregistered"]);
  assert(claimed?.attemptId);
  expect(claimed.id).toBe(id);
  expect(await queue.complete(id, undefined, claimed.attemptId)).toBe(true);
});

test("release and retirement do not revive a removed finalized import handler", async () => {
  const runtime = await fixture();
  const { queue, hold } = firstBorrower(runtime);
  expect(await hold.hold()).toBe(true);
  queue.unregisterHandler(IMPORT_JOB_TYPE);
  await assert.rejects(hold.hold(), /replaced/);
  expect(() => hold.release()).toThrow("replaced");
  await hold.close();
  expect(queue.getHandler(IMPORT_JOB_TYPE)).toBeUndefined();
});
