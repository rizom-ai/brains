import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import {
  localDatabaseEndpointEnv,
  localDatabaseOwnershipEnv,
  type LocalDatabaseEndpointConfig,
} from "@brains/core";
import { createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

const responseSchema = z.object({
  id: z.number(),
  value: z.unknown().optional(),
  error: z.string().optional(),
});
interface Worker {
  endpoint: LocalDatabaseEndpointConfig;
  call(action: string, value?: unknown): Promise<unknown>;
  close(): Promise<void>;
}
async function worker(
  dir: string,
  endpoint?: LocalDatabaseEndpointConfig,
): Promise<Worker> {
  let next = 0;
  const pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  const wait = (id: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const deadline = AbortSignal.timeout(5000);
      const onTimeout = (): void => {
        pending.delete(id);
        reject(new Error("Grouping fixture timed out"));
      };
      deadline.addEventListener("abort", onTimeout, { once: true });
      pending.set(id, {
        resolve: (value): void => {
          deadline.removeEventListener("abort", onTimeout);
          resolve(value);
        },
        reject: (error): void => {
          deadline.removeEventListener("abort", onTimeout);
          reject(error);
        },
      });
    });
  const ready = wait(0);
  const child = Bun.spawn(
    [
      process.execPath,
      new URL("./grouping-process.ts", import.meta.url).pathname,
      dir,
      endpoint ? "borrower" : "owner",
    ],
    {
      env: endpoint
        ? {
            ...process.env,
            [localDatabaseEndpointEnv.address]: endpoint.address,
            [localDatabaseEndpointEnv.secret]: endpoint.secret,
            [localDatabaseEndpointEnv.sessionId]: endpoint.sessionId,
            [localDatabaseOwnershipEnv.forbidLocalOpen]: "1",
          }
        : process.env,
      stdout: "ignore",
      stderr: "pipe",
      ipc: (input): void => {
        const message = responseSchema.parse(input);
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request?.reject(new Error(message.error));
        else request?.resolve(message.value);
      },
      onExit: (): void => {
        for (const request of pending.values())
          request.reject(new Error("Grouping fixture exited"));
        pending.clear();
      },
    },
  );
  const errors = new Response(child.stderr).text();
  let config = endpoint;
  try {
    const announced = await ready;
    config ??= z
      .strictObject({
        address: z.string().min(1),
        secret: z.string().min(32),
        sessionId: z.string().min(1),
      })
      .parse(announced);
  } catch (error) {
    child.kill();
    await child.exited;
    throw new Error(await errors, { cause: error });
  }
  const call = (action: string, value?: unknown): Promise<unknown> => {
    const id = ++next;
    const response = wait(id);
    child.send({ id, action, value });
    return response;
  };
  const running = (): boolean => child.exitCode === null;
  return {
    endpoint: config,
    call,
    close: async (): Promise<void> => {
      if (!running()) {
        expect(await child.exited).toBe(0);
        expect(await errors).toBe("");
        return;
      }
      try {
        await call("close");
        expect(await child.exited).toBe(0);
        expect(await errors).toBe("");
      } finally {
        if (running()) {
          child.kill();
          await child.exited;
        }
      }
    },
  };
}
async function withWorkers(
  run: (
    writer: Worker,
    reader: Worker,
    restart: () => Promise<[Worker, Worker]>,
  ) => Promise<void>,
): Promise<void> {
  const directory = await createTestDirectory();
  const owned: Worker[] = [];
  const failures: unknown[] = [];
  const start = async (): Promise<[Worker, Worker]> => {
    const writer = await worker(directory.dir);
    owned.push(writer);
    const reader = await worker(directory.dir, writer.endpoint);
    owned.push(reader);
    return [writer, reader];
  };
  const restart = async (): Promise<[Worker, Worker]> => {
    // Actual borrower exit precedes owner retirement and the next native open.
    for (const child of [...owned].reverse()) await child.close();
    return start();
  };
  try {
    const [writer, reader] = await start();
    await run(writer, reader, restart);
  } catch (error) {
    failures.push(error);
  } finally {
    for (const child of [...owned].reverse()) {
      try {
        await child.close();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await directory.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Grouping process fixture failed", {
      cause: failures[0],
    });
}
async function ready(worker: Worker): Promise<unknown> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const page = await worker.call("read");
    if (z.object({ ready: z.literal(true) }).safeParse(page).success)
      return page;
    await Bun.sleep(5);
  }
  throw new Error("Grouping scan did not become ready");
}
const areas = { label: "Areas", types: ["note"], multiple: true };

test("separate processes share owner readiness and only the owner controls interrupted scans", async () => {
  await withWorkers(async (writer, reader) => {
    await writer.call("note", ["Research"]);
    await writer.call("pause", true);
    await rejects(reader.call("pause", true), /Only the database owner/);
    await writer.call("define", { areas });
    expect(await writer.call("read")).toEqual({ ready: false });
    expect(await reader.call("read")).toEqual({ ready: false });
    await writer.call("pause", false);
    expect(await ready(reader)).toEqual({
      ready: true,
      values: [{ value: "Research", count: 1 }],
    });
    expect(await ready(writer)).toEqual({
      ready: true,
      values: [{ value: "Research", count: 1 }],
    });
  });
}, 15000);

test("a joined owner restart completes a scan interrupted after the definitions were saved", async () => {
  await withWorkers(async (writer, reader, restart) => {
    await writer.call("note", ["Recovered"]);
    await writer.call("pause", true);
    await writer.call("define", { areas });
    expect(await reader.call("read")).toEqual({ ready: false });
    const [restarted, reconnected] = await restart();
    for (const process of [restarted, reconnected]) {
      expect(await ready(process)).toEqual({
        ready: true,
        values: [{ value: "Recovered", count: 1 }],
      });
    }
  });
}, 15000);

test.each(["Areas", "Renamed areas"])(
  "a reader does not miss a remove/re-add cycle (%s) while the saving process is interrupted",
  async (label) => {
    await withWorkers(async (writer, reader) => {
      await writer.call("note", ["Before"]);
      await writer.call("define", { areas });
      expect(await ready(reader)).toEqual({
        ready: true,
        values: [{ value: "Before", count: 1 }],
      });
      await writer.call("define", {});
      await writer.call("note", ["After"]);
      await writer.call("pause", true);
      await writer.call("define", { areas: { ...areas, label } });
      expect(await reader.call("read")).toEqual({ ready: false });
      await writer.call("pause", false);
      expect(await ready(reader)).toEqual({
        ready: true,
        values: [{ value: "After", count: 1 }],
      });
      await ready(writer);
    });
  },
  15000,
);
