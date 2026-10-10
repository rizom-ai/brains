import { Effect, Layer, Option } from "@brains/utils/effect";
import { BunSocket } from "@brains/utils/effect/bun";
import {
  Queue,
  RpcServer,
  Socket,
  SocketServer,
} from "@brains/utils/effect/rpc";
import type { RpcMessage } from "@brains/utils/effect/rpc";
import { parseBrokerRpcRequest } from "./rpc-contract";
import { makeBrokerRpcSerialization } from "./rpc-serialization";
import { withBoundedRpcOutput } from "./rpc-socket";

interface Peer {
  send(message: RpcMessage.FromServerEncoded): Effect.Effect<void>;
  close(): void;
}

/**
 * Effect owns request/stream bookkeeping; this adapter owns only byte transport.
 * Unlike the stock socket protocol, every malformed frame closes its peer and
 * every admitted write is bounded, including native bytes after interruption.
 */
export const brokerRpcServerProtocol: Layer.Layer<
  RpcServer.Protocol,
  never,
  SocketServer.SocketServer
> = Layer.effect(
  RpcServer.Protocol,
  RpcServer.Protocol.make((receive) =>
    Effect.gen(function* () {
      const server = yield* SocketServer.SocketServer;
      const serialization = makeBrokerRpcSerialization();
      const disconnects = yield* Queue.make<number>();
      const peers = new Map<number, Peer>();
      let nextId = 0;
      yield* Effect.forkScoped(
        server.run((socket) =>
          Effect.scoped(
            Effect.gen(function* () {
              const native = yield* Effect.serviceOption(BunSocket.NetSocket);
              if (Option.isNone(native))
                return yield* Effect.die(
                  "Bun socket server did not provide its peer socket",
                );
              const connection = native.value;
              const id = nextId++;
              const parser = serialization.makeUnsafe();
              const close = (): void => {
                connection.destroy();
              };
              const writer = yield* withBoundedRpcOutput(socket, {
                bufferedBytes: () => connection.writableLength,
                onOverflow: close,
              }).writer;
              const send = (
                message: RpcMessage.FromServerEncoded,
              ): Effect.Effect<void> =>
                Effect.suspend(() => {
                  try {
                    const frame = parser.encode(message);
                    return frame
                      ? writer
                          .write(frame)
                          .pipe(Effect.catchCause(() => Effect.sync(close)))
                      : Effect.void;
                  } catch {
                    // Invalid or oversized output fails visibly by disconnecting
                    // this peer. Its admitted Git work and ledger remain owned.
                    close();
                    return Effect.void;
                  }
                });
              peers.set(id, { send, close });
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  peers.delete(id);
                  close();
                  Queue.offerUnsafe(disconnects, id);
                }),
              );
              const { pull } = yield* socket.reader;
              yield* Effect.forever(
                Effect.gen(function* () {
                  const frames = yield* pull;
                  for (const frame of frames) {
                    const messages = yield* Effect.try({
                      try: () =>
                        parser.decode(frame).map(parseBrokerRpcRequest),
                      catch: (cause) =>
                        new Socket.SocketError({
                          reason: new Socket.SocketReadError({ cause }),
                        }),
                    });
                    for (const message of messages) yield* receive(id, message);
                  }
                }),
              );
            }),
          ).pipe(Effect.catchCause(() => Effect.void)),
        ),
      );
      return {
        disconnects,
        send: (id, message) => peers.get(id)?.send(message) ?? Effect.void,
        end: (id) => Effect.sync(() => peers.get(id)?.close()),
        clientIds: Effect.sync(() => new Set(peers.keys())),
        initialMessage: Effect.succeedNone,
        supportsAck: true,
        supportsTransferables: false,
        supportsSpanPropagation: false,
        supportsNotifications: false,
        codecFor: serialization.codecFor,
      };
    }),
  ),
);
