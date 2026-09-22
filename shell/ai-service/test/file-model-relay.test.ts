import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { withFileModelRelay } from "../src/file-model-relay";

test("an early producer return releases blocked SDK backpressure and joins control retirement", async () => {
  const entered = Promise.withResolvers<void>();
  const blocked = Promise.withResolvers<void>();
  const state: { reason?: unknown; posted?: Promise<unknown> } = {};
  await assert.rejects(
    withFileModelRelay(
      "stream",
      "{}",
      async (metadata) => {
        assert.ok(metadata["url"] && metadata["token"]);
        const headers = { authorization: `Bearer ${metadata["token"]}` };
        const request = await fetch(`${metadata["url"]}/request`, { headers });
        expect(await request.text()).toBe("{}");
        state.posted = fetch(`${metadata["url"]}/response`, {
          method: "POST",
          headers,
          body:
            JSON.stringify({ type: "file-model-response", headers: {} }) +
            "\n" +
            JSON.stringify({ type: "text-start", id: "text-1" }) +
            "\n",
        }).catch((error: unknown) => error);
        await entered.promise;
        return { frames: 0, sizeBytes: 0, sha256: "0".repeat(64) };
      },
      {
        ready: () => {},
        part: async () => {
          entered.resolve();
          await blocked.promise;
        },
        abort: (reason) => {
          state.reason = reason;
          blocked.reject(reason);
        },
      },
    ),
    (error: unknown) =>
      error === state.reason ||
      (error instanceof AggregateError && error.cause === state.reason),
  );
  assert.ok(state.reason instanceof Error);
  expect(state.reason.message).toContain("without a verified control response");
  await state.posted;
});
