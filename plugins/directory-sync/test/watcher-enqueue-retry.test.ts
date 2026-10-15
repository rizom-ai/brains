import { describe, expect, it } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { RetryScope } from "@brains/utils/retry-backoff";
import { setupFileWatcher } from "../src/lib/auto-sync";
import type { JobRequest } from "../src/types";

type JobQueueCallback = (job: JobRequest) => Promise<string | undefined>;

/** The watcher's queue callback, as setupFileWatcher hands it over. */
function captureCallback(
  context: ReturnType<typeof createMockServicePluginContext>,
  retries: RetryScope,
): JobQueueCallback {
  const captured: { callback?: JobQueueCallback } = {};
  setupFileWatcher(
    context,
    {
      setJobQueueCallback: (callback): void => {
        captured.callback = callback;
      },
    },
    "/tmp/brain-data",
    undefined,
    retries,
  );
  if (!captured.callback) throw new Error("No job queue callback set");
  return captured.callback;
}

const fileChange: JobRequest = {
  type: "directory-import",
  data: { paths: ["/tmp/brain-data/note/a.md"] },
};

describe("watched file changes the queue refuses", () => {
  // A watched change is seen once: dropped, the file is not imported until
  // it changes again or the brain restarts.
  it("queues a refused change once the queue admits it", async () => {
    const context = createMockServicePluginContext();
    const retries = new RetryScope({
      firstDelayMs: 10,
      logger: createSilentLogger(),
    });
    context.jobs.enqueueBatch.mockImplementationOnce(async () => {
      throw new Error("Failed to acquire atomic enqueue transaction");
    });
    const callback = captureCallback(context, retries);

    expect(await callback(fileChange)).toBeUndefined();
    await waitUntil(
      () => context.jobs.enqueueBatch.mock.calls.length === 2,
      "the refused change to be queued",
    );
    await retries.dispose();

    expect(context.jobs.enqueueBatch.mock.calls[1]?.[0]).toEqual([
      {
        type: "directory-import",
        data: { paths: ["/tmp/brain-data/note/a.md"] },
      },
    ]);
  });

  it("stops retrying a refused change when its generation stops", async () => {
    const context = createMockServicePluginContext();
    const retries = new RetryScope({
      firstDelayMs: 10,
      logger: createSilentLogger(),
    });
    context.jobs.enqueueBatch.mockImplementation(async () => {
      throw new Error("Failed to acquire atomic enqueue transaction");
    });
    const callback = captureCallback(context, retries);

    await callback(fileChange);
    await waitUntil(
      () => context.jobs.enqueueBatch.mock.calls.length >= 2,
      "a retry to be refused",
    );
    await retries.dispose();
    const attempts = context.jobs.enqueueBatch.mock.calls.length;
    await Bun.sleep(100);

    expect(context.jobs.enqueueBatch.mock.calls).toHaveLength(attempts);
  });
});
