import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { readBoundedJsonResponse } from "../src/bounded-json-response";

test("bounded metadata accepts an exact byte boundary and split UTF-8", async () => {
  const bytes = new TextEncoder().encode('{"text":"é"}');
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const response = new Response(body);
  expect(await readBoundedJsonResponse(response, bytes.length)).toEqual({
    text: "é",
  });
  expect(body.locked).toBe(false);
});

test("streamed overflow joins failed cancellation and retains both causes", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const cleanup = new Error("cancel failed");
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(new TextEncoder().encode("too large"));
    },
    cancel: async (): Promise<void> => {
      entered.resolve();
      await release.promise;
      throw cleanup;
    },
  });
  let settled = false;
  const work = readBoundedJsonResponse(
    new Response(body, { headers: { "content-length": "1" } }),
    1,
  ).finally(() => {
    settled = true;
  });
  const rejected = assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.cause instanceof Error);
    expect(error.cause.message).toContain("exceeds its byte limit");
    expect(error.errors).toEqual([error.cause, cleanup]);
    return true;
  });
  try {
    await entered.promise;
    expect(settled).toBe(false);
    expect(body.locked).toBe(true);
  } finally {
    release.resolve();
  }
  await rejected;
  expect(body.locked).toBe(false);
});

test.each(["100", "invalid", "-1", "9007199254740992"])(
  "rejects untrusted declared length %s and cancels the body",
  async (length) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel(): void {
        cancelled = true;
      },
    });
    await assert.rejects(
      readBoundedJsonResponse(
        new Response(body, { headers: { "content-length": length } }),
        10,
      ),
      /invalid length/,
    );
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  },
);

test("HTTP rejection cancels instead of reading an error payload", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel(): void {
      cancelled = true;
    },
  });
  await assert.rejects(
    readBoundedJsonResponse(new Response(body, { status: 429 }), 64),
    /HTTP 429/,
  );
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
});

test("read failure identity survives duplicate cancellation rejection", async () => {
  const primary = new Error("metadata stream failed");
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.error(primary);
    },
  });
  await assert.rejects(
    readBoundedJsonResponse(new Response(body), 64),
    (error: unknown) => error === primary,
  );
  expect(body.locked).toBe(false);
});

test.each(["", "not JSON", '{"partial":'])(
  "rejects invalid JSON %j after draining and releases the reader",
  async (text) => {
    const response = new Response(text);
    await assert.rejects(readBoundedJsonResponse(response, 64));
    expect(response.body?.locked).toBe(false);
  },
);

test("invalid UTF-8 is rejected, not silently replaced", async () => {
  const response = new Response(new Uint8Array([0xff]));
  await assert.rejects(readBoundedJsonResponse(response, 64));
  expect(response.body?.locked).toBe(false);
});

test.each([0, -1, 1.5, Infinity, NaN])(
  "invalid limit %s still cancels its owned response",
  async (limit) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel(): void {
        cancelled = true;
      },
    });
    await assert.rejects(
      readBoundedJsonResponse(new Response(body), limit),
      /positive safe byte limit/,
    );
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  },
);

test("does not steal an existing reader's ownership", async () => {
  const response = new Response("{}");
  const owner = response.body?.getReader();
  assert.ok(owner);
  try {
    await assert.rejects(readBoundedJsonResponse(response, 64));
    expect(response.body?.locked).toBe(true);
  } finally {
    await owner.cancel();
    owner.releaseLock();
  }
});
