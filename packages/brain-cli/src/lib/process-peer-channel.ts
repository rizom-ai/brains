import type { EventEmitter } from "node:events";
import type { PeerChannel, PeerEvent } from "@brains/core";
import { peerEventMessageSchema } from "./peer-event-message";

/**
 * What a supervised child's IPC line offers. Its messages are heard through
 * EventEmitter's base contract, as process signals are: Bun 1.4 declares
 * `Process.off` for `memoryPressure` alone, which hides the inherited
 * signature a `"message"` listener needs.
 */
interface SupervisedProcess extends Pick<EventEmitter, "on" | "off"> {
  send?: (message: { type: "peer-event"; event: PeerEvent }) => unknown;
}

/**
 * A supervised child's line to the runtime's other app role: its events go up
 * to the supervisor, which relays the other role's events down.
 */
export function processPeerChannel(process: SupervisedProcess): PeerChannel {
  return {
    send: (event): void => {
      process.send?.({ type: "peer-event", event });
    },
    onEvent: (listener) => {
      const onMessage = (message: unknown): void => {
        const relayed = peerEventMessageSchema.safeParse(message);
        if (relayed.success) listener(relayed.data.event);
      };
      process.on("message", onMessage);
      return () => {
        process.off("message", onMessage);
      };
    },
  };
}
