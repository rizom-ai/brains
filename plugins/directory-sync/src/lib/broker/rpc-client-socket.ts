import { Effect, Layer } from "@brains/utils/effect";
import { makeInspectableNetSocket } from "@brains/utils/effect/bun";
import { Socket } from "@brains/utils/effect/rpc";
import { withBoundedRpcOutput } from "./rpc-socket";

/** The stock layerNet hides writableLength, needed for a hard byte budget. */
export function brokerRpcClientSocket(
  path: string,
): Layer.Layer<Socket.Socket> {
  return Layer.effect(
    Socket.Socket,
    Effect.map(makeInspectableNetSocket({ path }), (native) =>
      withBoundedRpcOutput(native.socket, {
        bufferedBytes: native.bufferedBytes,
        onOverflow: native.close,
      }),
    ),
  );
}
