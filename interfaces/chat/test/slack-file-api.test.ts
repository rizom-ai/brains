import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  createSlackFileMetadataApi,
  type SlackMetadataFetch,
} from "../src/slack-file-api";
import { deliverSlackFile } from "../src/slack-file-delivery";

const initialization = { filename: "résumé.pdf", length: 1234 };
const completion = {
  files: [{ id: "F123", title: "résumé.pdf" }],
  channel_id: "C123",
  thread_ts: "123.456",
};
const initialized = {
  ok: true,
  file_id: "F123",
  upload_url: "http://127.0.0.1/upload",
};
const completed = { ok: true, files: [{ id: "F123" }] };

test("Slack metadata calls use fixed endpoints and bounded form fields without file bytes", async () => {
  const caller = new AbortController();
  const fetcher = mock<SlackMetadataFetch>(async (url, options) => {
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBe(caller.signal);
    expect(new Headers(options.headers).get("authorization")).toBe(
      "Bearer xoxb-test",
    );
    expect(new Headers(options.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    assert.ok(typeof options.body === "string");
    const fields = new URLSearchParams(options.body);
    if (url.endsWith("files.getUploadURLExternal")) {
      expect(url).toBe("https://slack.com/api/files.getUploadURLExternal");
      expect(Object.fromEntries(fields)).toEqual({
        filename: initialization.filename,
        length: "1234",
      });
      return Response.json(initialized);
    }
    expect(url).toBe("https://slack.com/api/files.completeUploadExternal");
    expect(Object.fromEntries(fields)).toEqual({
      files: JSON.stringify(completion.files),
      channel_id: "C123",
      thread_ts: "123.456",
    });
    return Response.json(completed);
  });
  const api = createSlackFileMetadataApi("xoxb-test", fetcher);
  expect(await api.initialize(initialization, caller.signal)).toEqual(
    initialized,
  );
  expect(await api.complete(completion, caller.signal)).toEqual(completed);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("metadata adapter composes with owned POST without sending the Slack token to the upload URL", async () => {
  const order: string[] = [];
  const api = createSlackFileMetadataApi("xoxb-secret", async (url) => {
    order.push(
      url.endsWith("files.getUploadURLExternal") ? "initialize" : "complete",
    );
    return Response.json(order.length === 1 ? initialized : completed);
  });
  expect(
    await deliverSlackFile(
      {
        sourceFile: "/owned/verified",
        sizeBytes: 1234,
        sha256: "a".repeat(64),
        filename: initialization.filename,
        channelId: "C123",
      },
      {
        ...api,
        postHttp: async (request) => {
          order.push("owned-post");
          expect(request.url).toBe(initialized.upload_url);
          expect(request.headers).toEqual({
            "content-type": "application/octet-stream",
          });
          return { ...request.facts, statusCode: 200 };
        },
      },
    ),
  ).toEqual({ fileId: "F123" });
  expect(order).toEqual(["initialize", "owned-post", "complete"]);
});

test("pre-abort and invalid inputs issue no metadata request", async () => {
  const fetcher = mock<SlackMetadataFetch>(async () =>
    Response.json(completed),
  );
  const api = createSlackFileMetadataApi("xoxb-test", fetcher);
  const caller = new AbortController();
  const primary = new Error("cancelled");
  caller.abort(primary);
  await assert.rejects(
    api.initialize(initialization, caller.signal),
    (error: unknown) => error === primary,
  );
  await assert.rejects(
    api.complete(completion, caller.signal),
    (error: unknown) => error === primary,
  );
  await assert.rejects(
    api.initialize({ ...initialization, length: 8 * 1024 * 1024 + 1 }),
  );
  await assert.rejects(api.complete({ ...completion, files: [] }));
  expect(() => createSlackFileMetadataApi("bad\r\ntoken", fetcher)).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([307, 429, 500])(
  "HTTP %s is not retried and joins body cancellation",
  async (status) => {
    let cancelled = false;
    const fetcher = mock<SlackMetadataFetch>(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel(): void {
              cancelled = true;
            },
          }),
          {
            status,
            headers: {
              location: "https://example.test/redirect",
              "retry-after": "1",
            },
          },
        ),
    );
    const api = createSlackFileMetadataApi("xoxb-test", fetcher);
    await assert.rejects(
      api.complete(completion),
      new RegExp(`HTTP ${status}`),
    );
    expect(cancelled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test("transport failure preserves the original cause graph without retry", async () => {
  const failure = new AggregateError([
    new Error("submitted outcome unknown"),
    new Error("cleanup failed"),
  ]);
  const fetcher = mock<SlackMetadataFetch>(async () => {
    throw failure;
  });
  const api = createSlackFileMetadataApi("xoxb-test", fetcher);
  await assert.rejects(
    api.complete(completion),
    (error: unknown) => error === failure,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("submitted completion is awaited after cancellation and keeps a late acknowledgement", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const fetcher = mock<SlackMetadataFetch>(async () => {
    entered.resolve();
    await release.promise;
    return Response.json(completed);
  });
  const api = createSlackFileMetadataApi("xoxb-test", fetcher);
  let settled = false;
  const work = api.complete(completion, caller.signal).finally(() => {
    settled = true;
  });
  try {
    await Promise.race([entered.promise, work]);
    caller.abort(new Error("late cancellation"));
    await Promise.resolve();
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await work).toEqual(completed);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("oversized metadata bodies are cancelled without replay", async () => {
  let cancelled = false;
  const fetcher = mock<SlackMetadataFetch>(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller): void {
            controller.enqueue(new Uint8Array(64 * 1024 + 1));
          },
          cancel(): void {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    createSlackFileMetadataApi("xoxb-test", fetcher).initialize(initialization),
    /byte limit/,
  );
  expect(cancelled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("Slack rejects a metadata operation without automatic retry", async () => {
  const fetcher = mock<SlackMetadataFetch>(async () =>
    Response.json({ ok: false, error: "not_authed" }),
  );
  await assert.rejects(
    createSlackFileMetadataApi("xoxb-test", fetcher).complete(completion),
    /files.completeUploadExternal rejected: not_authed/,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
