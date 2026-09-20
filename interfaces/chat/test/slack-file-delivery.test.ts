import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  deliverSlackFile,
  type SlackFileDeliveryDeps,
  type SlackFileDeliveryInput,
} from "../src/slack-file-delivery";
import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "../src/artifact-limits";

const input: SlackFileDeliveryInput = {
  sourceFile: "/owned/verified",
  sizeBytes: 1234,
  sha256: "a".repeat(64),
  filename: "résumé.pdf",
  channelId: "C123",
  threadTs: "1234567890.123456",
};
const initialized = {
  ok: true,
  file_id: "F123",
  upload_url: "http://127.0.0.1/upload",
};
const completed = { ok: true, files: [{ id: "F123" }] };
function dependencies(
  overrides: Partial<SlackFileDeliveryDeps> = {},
): SlackFileDeliveryDeps {
  return {
    initialize: mock(async () => initialized),
    postHttp: mock(async (request) => ({ ...request.facts, statusCode: 200 })),
    complete: mock(async () => completed),
    ...overrides,
  };
}

test("Slack file delivery joins POST before sharing, and sharing before releasing its consumer", async () => {
  const postEntered = Promise.withResolvers<void>();
  const postRelease = Promise.withResolvers<void>();
  const completeEntered = Promise.withResolvers<void>();
  const completeRelease = Promise.withResolvers<void>();
  const caller = new AbortController();
  const deps = dependencies({
    postHttp: mock(async (request, options) => {
      expect(request).toEqual({
        sourceFile: input.sourceFile,
        facts: { sizeBytes: input.sizeBytes, sha256: input.sha256 },
        url: initialized.upload_url,
        headers: { "content-type": "application/octet-stream" },
      });
      expect(options?.signal).toBe(caller.signal);
      postEntered.resolve();
      await postRelease.promise;
      return { ...request.facts, statusCode: 200 };
    }),
    complete: mock(async (request, signal) => {
      expect(request).toEqual({
        files: [{ id: "F123", title: input.filename }],
        channel_id: input.channelId,
        thread_ts: input.threadTs,
      });
      expect(signal).toBe(caller.signal);
      completeEntered.resolve();
      await completeRelease.promise;
      return completed;
    }),
  });
  let settled = false;
  const work = deliverSlackFile(input, deps, caller.signal).finally(() => {
    settled = true;
  });
  try {
    await Promise.race([postEntered.promise, work]);
    expect(deps.initialize).toHaveBeenCalledWith(
      { filename: input.filename, length: input.sizeBytes },
      caller.signal,
    );
    expect(deps.complete).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    postRelease.resolve();
    await Promise.race([completeEntered.promise, work]);
    caller.abort(new Error("late cancellation cannot retract sharing"));
    await Promise.resolve();
    expect(settled).toBe(false);
  } finally {
    postRelease.resolve();
    completeRelease.resolve();
  }
  expect(await work).toEqual({ fileId: "F123" });
  expect(deps.initialize).toHaveBeenCalledTimes(1);
  expect(deps.postHttp).toHaveBeenCalledTimes(1);
  expect(deps.complete).toHaveBeenCalledTimes(1);
});

test.each([
  { sourceFile: "relative.pdf" },
  { sourceFile: "/owned/\u0000invalid" },
  { sha256: "not-a-digest" },
  { filename: "invalid\r\nname" },
  { channelId: "C123\nother" },
  { threadTs: "not-a-timestamp" },
])("invalid metadata %j does not initialize an upload", async (invalid) => {
  const deps = dependencies();
  await assert.rejects(deliverSlackFile({ ...input, ...invalid }, deps));
  expect(deps.initialize).not.toHaveBeenCalled();
  expect(deps.postHttp).not.toHaveBeenCalled();
});

test("input metadata is captured before awaiting initialization", async () => {
  const mutable = { ...input };
  const deps = dependencies({
    initialize: mock(async () => {
      mutable.sourceFile = "/different/file";
      mutable.channelId = "C456";
      return initialized;
    }),
  });
  expect(await deliverSlackFile(mutable, deps)).toEqual({ fileId: "F123" });
  expect(deps.postHttp).toHaveBeenCalledWith(
    expect.objectContaining({ sourceFile: input.sourceFile }),
    undefined,
  );
  expect(deps.complete).toHaveBeenCalledWith(
    expect.objectContaining({ channel_id: input.channelId }),
    undefined,
  );
});

test("pre-abort does not initialize or upload", async () => {
  const caller = new AbortController();
  const primary = new Error("pre-abort");
  caller.abort(primary);
  const deps = dependencies();
  await assert.rejects(
    deliverSlackFile(input, deps, caller.signal),
    (error: unknown) => error === primary,
  );
  expect(deps.initialize).not.toHaveBeenCalled();
  expect(deps.postHttp).not.toHaveBeenCalled();
  expect(deps.complete).not.toHaveBeenCalled();
});

test.each(["initialize", "postHttp"] as const)(
  "cancellation after %s acknowledgement stops the next stage",
  async (stage) => {
    const caller = new AbortController();
    const primary = new Error("stop before next admission");
    const deps = dependencies(
      stage === "initialize"
        ? {
            initialize: mock(async () => {
              caller.abort(primary);
              return initialized;
            }),
          }
        : {
            postHttp: mock(async (request) => {
              caller.abort(primary);
              return { ...request.facts, statusCode: 200 };
            }),
          },
    );
    await assert.rejects(
      deliverSlackFile(input, deps, caller.signal),
      (error: unknown) => error === primary,
    );
    expect(deps.initialize).toHaveBeenCalledTimes(1);
    expect(deps.postHttp).toHaveBeenCalledTimes(stage === "initialize" ? 0 : 1);
    expect(deps.complete).not.toHaveBeenCalled();
  },
);

test.each(["initialize", "postHttp", "complete"] as const)(
  "%s failure preserves its error graph without replay",
  async (stage) => {
    const primary = new Error("remote outcome unknown");
    const cleanup = new Error("retirement failed");
    const failure = new AggregateError([primary, cleanup], "transfer failed", {
      cause: primary,
    });
    const deps = dependencies({
      [stage]: mock(async (): Promise<never> => {
        throw failure;
      }),
    });
    await assert.rejects(
      deliverSlackFile(input, deps),
      (error: unknown) => error === failure,
    );
    expect(deps.initialize).toHaveBeenCalledTimes(1);
    expect(deps.postHttp).toHaveBeenCalledTimes(stage === "initialize" ? 0 : 1);
    expect(deps.complete).toHaveBeenCalledTimes(stage === "complete" ? 1 : 0);
  },
);

test.each([0, CHAT_NATIVE_ARTIFACT_MAX_BYTES + 1, Infinity, 1.5])(
  "invalid source size %s acquires no upload",
  async (sizeBytes) => {
    const deps = dependencies();
    await assert.rejects(deliverSlackFile({ ...input, sizeBytes }, deps));
    expect(deps.initialize).not.toHaveBeenCalled();
    expect(deps.postHttp).not.toHaveBeenCalled();
  },
);

test("exact native limit and a channel-level send preserve metadata without adding a thread", async () => {
  const deps = dependencies();
  const { threadTs: _thread, ...channelInput } = input;
  expect(
    await deliverSlackFile(
      { ...channelInput, sizeBytes: CHAT_NATIVE_ARTIFACT_MAX_BYTES },
      deps,
    ),
  ).toEqual({ fileId: "F123" });
  expect(deps.complete).toHaveBeenCalledWith(
    {
      files: [{ id: "F123", title: input.filename }],
      channel_id: input.channelId,
    },
    undefined,
  );
});

test.each([
  { ...initialized, ok: false },
  { ...initialized, file_id: "" },
  { ...initialized, upload_url: "file:///secret" },
])("invalid initialization %j prevents POST and sharing", async (reply) => {
  const deps = dependencies({ initialize: mock(async () => reply) });
  await assert.rejects(deliverSlackFile(input, deps));
  expect(deps.postHttp).not.toHaveBeenCalled();
  expect(deps.complete).not.toHaveBeenCalled();
});

test.each([
  { statusCode: 307, sizeBytes: input.sizeBytes, sha256: input.sha256 },
  { statusCode: 403, sizeBytes: input.sizeBytes, sha256: input.sha256 },
  { statusCode: 200, sizeBytes: input.sizeBytes - 1, sha256: input.sha256 },
  { statusCode: 200, sizeBytes: input.sizeBytes, sha256: "b".repeat(64) },
])("invalid upload receipt %j is not shared or replayed", async (reply) => {
  const deps = dependencies({ postHttp: mock(async () => reply) });
  await assert.rejects(deliverSlackFile(input, deps));
  expect(deps.postHttp).toHaveBeenCalledTimes(1);
  expect(deps.complete).not.toHaveBeenCalled();
});

test.each([
  { ok: false, files: [{ id: "F123" }] },
  { ok: true, files: [] },
  { ok: true, files: [{ id: "F456" }] },
  { ok: true, files: [{ id: "F123" }, { id: "F456" }] },
])(
  "uncertain completion %j does not replay initialization, bytes or sharing",
  async (reply) => {
    const deps = dependencies({ complete: mock(async () => reply) });
    await assert.rejects(deliverSlackFile(input, deps));
    expect(deps.initialize).toHaveBeenCalledTimes(1);
    expect(deps.postHttp).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledTimes(1);
  },
);
