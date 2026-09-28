import { expect, test } from "bun:test";
import { createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

const responseSchema = z.object({
  id: z.number(),
  value: z.unknown().optional(),
  error: z.string().optional(),
});
interface Worker {
  call(action: string, value?: unknown): Promise<unknown>;
  close(): Promise<void>;
}
async function worker(dir: string): Promise<Worker> {
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
    ],
    {
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
  try {
    await ready;
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
  run: (writer: Worker, reader: Worker, dir: string) => Promise<void>,
): Promise<void> {
  const directory = await createTestDirectory();
  const owned: Worker[] = [];
  let results: PromiseSettledResult<void>[];
  try {
    const writer = await worker(directory.dir);
    owned.push(writer);
    const reader = await worker(directory.dir);
    owned.push(reader);
    await run(writer, reader, directory.dir);
  } finally {
    results = await Promise.allSettled(owned.map((child) => child.close()));
    await directory.cleanup();
  }
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
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

test("two separate processes independently finish interrupted scans without shared status", async () => {
  await withWorkers(async (writer, reader) => {
    await writer.call("note", ["Research"]);
    await writer.call("pause", true);
    await reader.call("pause", true);
    await writer.call("define", { areas });
    expect(await writer.call("read")).toEqual({ ready: false });
    expect(await reader.call("read")).toEqual({ ready: false });
    await reader.call("pause", false);
    expect(await ready(reader)).toEqual({
      ready: true,
      values: [{ value: "Research", count: 1 }],
    });
    await writer.call("pause", false);
    expect(await ready(writer)).toEqual({
      ready: true,
      values: [{ value: "Research", count: 1 }],
    });
  });
}, 15000);

test("a new process completes a scan interrupted after the definitions were saved", async () => {
  await withWorkers(async (writer, _reader, dir) => {
    await writer.call("note", ["Recovered"]);
    await writer.call("pause", true);
    await writer.call("define", { areas });
    await writer.close();
    const restarted = await worker(dir);
    try {
      expect(await ready(restarted)).toEqual({
        ready: true,
        values: [{ value: "Recovered", count: 1 }],
      });
    } finally {
      await restarted.close();
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
      expect(await ready(reader)).toEqual({
        ready: true,
        values: [{ value: "After", count: 1 }],
      });
      await writer.call("pause", false);
      await ready(writer);
    });
  },
  15000,
);
