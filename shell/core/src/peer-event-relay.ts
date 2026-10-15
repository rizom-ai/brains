import { ENTITY_CHANNELS } from "@brains/contracts";
import type { IMessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils/logger";

/** An event one process of the runtime tells the others. */
export interface PeerEvent {
  type: string;
  payload: unknown;
}

/** This process's end of the line to the runtime's other processes. */
export interface PeerChannel {
  send(event: PeerEvent): void;
  onEvent(listener: (event: PeerEvent) => void): () => void;
}

/** The changes a peer must hear about: every entity write. */
const RELAYED_CHANNELS: readonly string[] = [
  ENTITY_CHANNELS.created,
  ENTITY_CHANNELS.updated,
  ENTITY_CHANNELS.deleted,
];

/**
 * Tell the runtime's other processes about this process's entity changes, and
 * hand theirs to this process's observers. An ordinary subscriber never sees a
 * peer event, so work runs once, where the change was made; a relayed event is
 * never relayed again, because the relay subscribes rather than observes.
 */
export function relayPeerEvents(
  messageBus: IMessageBus,
  channel: PeerChannel,
  logger: Logger,
): () => void {
  const outbound = RELAYED_CHANNELS.map((type) =>
    messageBus.subscribe(type, (message) => {
      channel.send({ type, payload: message.payload });
      return { success: true };
    }),
  );
  const inbound = channel.onEvent((event) => {
    if (!RELAYED_CHANNELS.includes(event.type)) return;
    void messageBus.deliverPeer(event.type, event.payload).catch((error) => {
      logger.warn(`Failed to deliver peer event ${event.type}`, { error });
    });
  });
  return () => {
    for (const unsubscribe of outbound) unsubscribe();
    inbound();
  };
}
