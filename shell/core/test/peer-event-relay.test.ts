import { describe, expect, it } from "bun:test";
import { ENTITY_CHANNELS } from "@brains/contracts";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import {
  relayPeerEvents,
  type PeerChannel,
  type PeerEvent,
} from "../src/peer-event-relay";

/** One end of a peer channel, recording what it sends. */
function fakeChannel(): PeerChannel & {
  sent: PeerEvent[];
  receive(event: PeerEvent): void;
} {
  const listeners = new Set<(event: PeerEvent) => void>();
  const sent: PeerEvent[] = [];
  return {
    sent,
    send: (event): void => {
      sent.push(event);
    },
    onEvent: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    receive: (event): void => {
      for (const listener of listeners) listener(event);
    },
  };
}

describe("peer event relay", () => {
  const logger = createSilentLogger();

  it("relays this process's entity changes to its peers", async () => {
    const bus = MessageBus.createFresh(logger);
    const channel = fakeChannel();
    relayPeerEvents(bus, channel, logger);

    await bus.send({
      type: ENTITY_CHANNELS.updated,
      payload: { entityType: "brain-character", entityId: "brain-character" },
      sender: "entity-service",
      broadcast: true,
    });

    expect(channel.sent).toEqual([
      {
        type: ENTITY_CHANNELS.updated,
        payload: {
          entityType: "brain-character",
          entityId: "brain-character",
        },
      },
    ]);
  });

  it("hands a peer's changes to observers, without sending them back", async () => {
    const bus = MessageBus.createFresh(logger);
    const channel = fakeChannel();
    relayPeerEvents(bus, channel, logger);
    const observed: unknown[] = [];
    const subscribed: unknown[] = [];
    bus.observe(ENTITY_CHANNELS.created, (message) => {
      observed.push(message.payload);
      return { success: true };
    });
    bus.subscribe(ENTITY_CHANNELS.created, (message) => {
      subscribed.push(message.payload);
      return { success: true };
    });

    channel.receive({
      type: ENTITY_CHANNELS.created,
      payload: { entityType: "note", entityId: "imported" },
    });
    await Bun.sleep(0);

    expect(observed).toEqual([{ entityType: "note", entityId: "imported" }]);
    expect(subscribed).toEqual([]);
    expect(channel.sent).toEqual([]);
  });

  it("ignores channels it does not relay", async () => {
    const bus = MessageBus.createFresh(logger);
    const channel = fakeChannel();
    relayPeerEvents(bus, channel, logger);
    const observed: unknown[] = [];
    bus.observe("job:progress", (message) => {
      observed.push(message.payload);
      return { success: true };
    });

    channel.receive({ type: "job:progress", payload: {} });
    await bus.send({
      type: "job:progress",
      payload: {},
      sender: "test",
      broadcast: true,
    });

    expect(channel.sent).toEqual([]);
    expect(observed).toEqual([{}]);
  });

  it("stops relaying once disposed", async () => {
    const bus = MessageBus.createFresh(logger);
    const channel = fakeChannel();
    const stop = relayPeerEvents(bus, channel, logger);
    stop();

    await bus.send({
      type: ENTITY_CHANNELS.deleted,
      payload: { entityType: "note", entityId: "gone" },
      sender: "entity-service",
      broadcast: true,
    });

    expect(channel.sent).toEqual([]);
  });
});
