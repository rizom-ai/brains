// Private Bun socket adapters; never re-export from authoring APIs.
import { createConnection } from "node:net";
import type { NetConnectOpts, Socket as NetSocket } from "node:net";
import { Effect } from "effect";
import * as BunSocketModule from "@effect/platform-bun/BunSocket";
import type * as EffectSocket from "effect/socket/Socket";
import { SocketError, SocketOpenError } from "effect/socket/Socket";

export * as BunSocket from "@effect/platform-bun/BunSocket";
export * as BunSocketServer from "@effect/platform-bun/BunSocketServer";

export interface InspectableNetSocket {
  readonly socket: EffectSocket.Socket;
  readonly bufferedBytes: () => number;
  readonly close: () => void;
}

/** Like makeNet, but exposes the native buffer count for bounded adapters. */
export function makeInspectableNetSocket(
  options: NetConnectOpts,
): Effect.Effect<InspectableNetSocket> {
  return Effect.suspend(() => {
    let connection: NetSocket | undefined;
    const acquire = Effect.acquireRelease(
      Effect.callback<NetSocket, SocketError>((resume) => {
        const native = createConnection(options);
        connection = native;
        native.once("connect", () => resume(Effect.succeed(native)));
        native.on("error", (cause) =>
          resume(
            Effect.fail(
              new SocketError({
                reason: new SocketOpenError({ kind: "Unknown", cause }),
              }),
            ),
          ),
        );
        return Effect.sync(() => {
          native.destroy();
        });
      }),
      (native) =>
        Effect.sync(() => {
          native.destroy();
        }),
      { interruptible: true },
    );
    return Effect.map(
      BunSocketModule.fromDuplex(acquire),
      (socket): InspectableNetSocket => ({
        socket,
        bufferedBytes: (): number => connection?.writableLength ?? 0,
        close: (): void => {
          connection?.destroy();
        },
      }),
    );
  });
}
