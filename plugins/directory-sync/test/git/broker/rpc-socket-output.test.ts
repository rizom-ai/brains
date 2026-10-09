import { describe, expect, it } from "bun:test";
import { Effect, Fiber, Result } from "@brains/utils/effect";
import { Socket } from "@brains/utils/effect/rpc";
import { deferred } from "@brains/utils/deferred";
import { withBoundedRpcOutput } from "../../../src/lib/broker/rpc-socket";

function fakeSocket(write: Socket.Writer["write"]): Socket.Socket {
  return Socket.make({
    reader: Effect.die("Output-only test socket"),
    writer: Effect.succeed({
      write,
      writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true }),
    }),
  });
}

function expectOverflow(result: Result.Result<void, Socket.SocketError>): void {
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure.reason._tag).toBe("SocketWriteError");
    if (result.failure.reason._tag === "SocketWriteError") {
      expect(result.failure.reason.cause).toBeInstanceOf(Error);
      if (result.failure.reason.cause instanceof Error) {
        expect(result.failure.reason.cause.message).toMatch(
          /backpressure|pending|limit/i,
        );
      }
    }
  }
}

describe("bounded Effect socket output", () => {
  it("accounts concurrent suspended frames across writer acquisitions and closes once", async () => {
    const firstStarted = deferred();
    const secondStarted = deferred();
    const release = deferred();
    let writes = 0;
    let closes = 0;
    const socket = withBoundedRpcOutput(
      fakeSocket(() =>
        Effect.promise(async () => {
          writes++;
          if (writes === 1) firstStarted.resolve();
          if (writes === 2) secondStarted.resolve();
          await release.promise;
        }),
      ),
      {
        bufferedBytes: () => 0,
        onOverflow: () => {
          closes++;
        },
        maxPendingBytes: 128,
      },
    );
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const firstWriter = yield* socket.writer;
            const secondWriter = yield* socket.writer;
            const first = yield* Effect.forkScoped(
              firstWriter.write(new Uint8Array(64)),
            );
            yield* Effect.promise(() => firstStarted.promise);
            const second = yield* Effect.forkScoped(
              secondWriter.write(new Uint8Array(64)),
            );
            yield* Effect.promise(() => secondStarted.promise);
            expectOverflow(
              yield* firstWriter.write(new Uint8Array(1)).pipe(Effect.result),
            );
            expectOverflow(
              yield* secondWriter.write(new Uint8Array(1)).pipe(Effect.result),
            );
            expect(closes).toBe(1);
            expect(writes).toBe(2);
            release.resolve();
            yield* Fiber.join(first);
            yield* Fiber.join(second);
          }),
        ),
      );
    } finally {
      release.resolve();
    }
  });

  it("continues accounting native bytes after a write observer is interrupted", async () => {
    const started = deferred();
    const release = deferred();
    let buffered = 0;
    let closes = 0;
    const socket = withBoundedRpcOutput(
      fakeSocket((chunk) =>
        Effect.promise(async () => {
          buffered +=
            typeof chunk === "string"
              ? Buffer.byteLength(chunk)
              : Socket.isCloseEvent(chunk)
                ? 0
                : chunk.byteLength;
          started.resolve();
          await release.promise;
          buffered = 0;
        }),
      ),
      {
        bufferedBytes: () => buffered,
        onOverflow: () => {
          closes++;
        },
        maxPendingBytes: 64,
      },
    );
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const writer = yield* socket.writer;
            const first = yield* Effect.forkScoped(
              writer.write(new Uint8Array(64)),
            );
            yield* Effect.promise(() => started.promise);
            yield* Fiber.interrupt(first);
            expect(buffered).toBe(64);
            expectOverflow(
              yield* writer.write(new Uint8Array(1)).pipe(Effect.result),
            );
            expect(closes).toBe(1);
          }),
        ),
      );
    } finally {
      release.resolve();
    }
  });

  it("bounds strings by UTF-8 bytes before calling the native writer", async () => {
    let writes = 0;
    let closes = 0;
    const socket = withBoundedRpcOutput(
      fakeSocket(() =>
        Effect.sync(() => {
          writes++;
        }),
      ),
      {
        bufferedBytes: () => 0,
        onOverflow: () => {
          closes++;
        },
        maxPendingBytes: 3,
      },
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const writer = yield* socket.writer;
          expectOverflow(yield* writer.write("🙂").pipe(Effect.result));
          expect(writes).toBe(0);
          expect(closes).toBe(1);
        }),
      ),
    );
  });
});
