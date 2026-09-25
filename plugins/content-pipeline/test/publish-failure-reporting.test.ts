import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  sendPublishFailed,
  executeWithProvider,
} from "../src/scheduler-publish";
import { RetryTracker } from "../src/retry-tracker";
import { uploadEvidence } from "./helpers/publish-recovery";

test("failure reporting joins broadcast and callback while isolating recovery from caller mutation", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const callbackEntered = Promise.withResolvers<void>();
  const callbackRelease = Promise.withResolvers<void>();
  const evidence = uploadEvidence();
  const expected = uploadEvidence();
  let settled = false;
  const onFailed = mock(
    async (event: { recovery?: unknown }): Promise<void> => {
      expect(event.recovery).toEqual(expected);
      expect(Object.isFrozen(event.recovery)).toBe(true);
      callbackEntered.resolve();
      await callbackRelease.promise;
    },
  );
  const work = sendPublishFailed(
    "social-post",
    "post-1",
    "failure",
    {
      retryTracker: RetryTracker.createFresh(),
      messageBus: {
        send: async (request): Promise<void> => {
          entered.resolve();
          await release.promise;
          expect(request.payload).toEqual(
            expect.objectContaining({ recovery: expected, willRetry: false }),
          );
        },
      },
      onFailed,
    },
    evidence,
  ).finally(() => {
    settled = true;
  });
  try {
    await Promise.race([entered.promise, work]);
    evidence.uploads.length = 0;
    expect(settled).toBe(false);
    expect(onFailed).not.toHaveBeenCalled();
    release.resolve();
    await Promise.race([callbackEntered.promise, work]);
    expect(settled).toBe(false);
  } finally {
    release.resolve();
    callbackRelease.resolve();
  }
  await work;
  expect(onFailed).toHaveBeenCalledTimes(1);
});

test("both reporting failures remain observed without replay", async () => {
  const broadcast = new Error("broadcast failed");
  const callback = new Error("callback failed");
  const send = mock(async (): Promise<never> => {
    throw broadcast;
  });
  const onFailed = mock(async (): Promise<never> => {
    throw callback;
  });
  const tracker = RetryTracker.createFresh();
  await assert.rejects(
    sendPublishFailed(
      "social-post",
      "post-1",
      "failure",
      { retryTracker: tracker, messageBus: { send }, onFailed },
      uploadEvidence(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, broadcast);
      assert.deepEqual(error.errors, [broadcast, callback]);
      return true;
    },
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(tracker.getRetryInfo("post-1")?.retryCount).toBe(1);
});

test("an asynchronous failure callback is not retried as another provider failure", async () => {
  const failure = new Error("callback failed");
  const publish = mock(async () => ({ error: "provider rejected" }));
  const onFailed = mock(async (): Promise<never> => {
    throw failure;
  });
  const tracker = RetryTracker.createFresh();
  await assert.rejects(
    executeWithProvider(
      {
        entityType: "social-post",
        entityId: "post-1",
        position: 0,
        queuedAt: "2024-01-01T00:00:00Z",
        authContext: { authorization: "system" },
      },
      { publishExecutor: { publish }, retryTracker: tracker, onFailed },
    ),
    (error: unknown) => error === failure,
  );
  expect(publish).toHaveBeenCalledTimes(1);
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(tracker.getRetryInfo("post-1")).toBeNull();
});

test("invalid evidence never enters any reporting sink", async () => {
  const onFailed = mock((): void => undefined);
  const send = mock(async (): Promise<void> => undefined);
  const tracker = RetryTracker.createFresh();
  await assert.rejects(
    sendPublishFailed(
      "social-post",
      "post-1",
      "failure",
      { retryTracker: tracker, messageBus: { send }, onFailed },
      { ...uploadEvidence(), nodes: [{ kind: "error", upload: 7 }] },
    ),
  );
  expect(onFailed).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(tracker.getRetryInfo("post-1")).toBeNull();
});
