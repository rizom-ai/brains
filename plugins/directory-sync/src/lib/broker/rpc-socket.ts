import { Effect } from "@brains/utils/effect";
import { Socket } from "@brains/utils/effect/rpc";
import { MAX_FRAME_BYTES } from "./protocol";

/** Bound admitted writes, including frames suspended on native backpressure. */
export function withBoundedRpcOutput(
  socket: Socket.Socket,
  options: {
    onOverflow: () => void;
    /** Native socket writableLength, including writes whose observer stopped. */
    bufferedBytes: () => number;
    maxPendingBytes?: number;
  },
): Socket.Socket {
  const limit = options.maxPendingBytes ?? MAX_FRAME_BYTES * 2;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_FRAME_BYTES * 2
  ) {
    throw new RangeError("Invalid broker RPC output limit");
  }
  let pending = 0;
  let closed: Socket.SocketError | undefined;
  return Socket.make({
    reader: socket.reader,
    writer: Effect.map(socket.writer, (writer): Socket.Writer => {
      const write: Socket.Writer["write"] = (chunk) =>
        Effect.suspend(() => {
          if (closed) return Effect.fail(closed);
          if (Socket.isCloseEvent(chunk)) return writer.write(chunk);
          const bytes =
            typeof chunk === "string"
              ? Buffer.byteLength(chunk, "utf8")
              : chunk.byteLength;
          if (Math.max(pending, options.bufferedBytes()) + bytes > limit) {
            closed = new Socket.SocketError({
              reason: new Socket.SocketWriteError({
                cause: new Error(
                  `RPC output backpressure exceeds the ${limit}-byte pending limit`,
                ),
              }),
            });
            options.onOverflow();
            return Effect.fail(closed);
          }
          pending += bytes;
          return writer.write(chunk).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                pending -= bytes;
              }),
            ),
          );
        });
      return {
        write,
        writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true }),
      };
    }),
  });
}
