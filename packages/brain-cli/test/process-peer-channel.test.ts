import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { PeerEvent } from "@brains/core";
import { processPeerChannel } from "../src/lib/process-peer-channel";

/** A supervised child's process: its IPC line to the supervisor. */
function fakeProcess(): EventEmitter & { send: ReturnType<typeof mock> } {
  return Object.assign(new EventEmitter(), {
    send: mock((_message: unknown) => true),
  });
}

describe("process peer channel", () => {
  const event: PeerEvent = {
    type: "entity:updated",
    payload: { entityType: "brain-character", entityId: "brain-character" },
  };

  it("sends this process's events to the supervisor", () => {
    const process = fakeProcess();

    processPeerChannel(process).send(event);

    expect(process.send).toHaveBeenCalledWith({ type: "peer-event", event });
  });

  it("hands on the peer events the supervisor relays, and nothing else", () => {
    const process = fakeProcess();
    const received: PeerEvent[] = [];
    processPeerChannel(process).onEvent((relayed) => received.push(relayed));

    process.emit("message", { type: "peer-event", event });
    process.emit("message", { type: "broker-close-admission" });
    process.emit("message", { type: "peer-event", event: { payload: {} } });

    expect(received).toEqual([event]);
  });

  it("stops listening once its listener is removed", () => {
    const process = fakeProcess();
    const received: PeerEvent[] = [];
    const stop = processPeerChannel(process).onEvent((relayed) =>
      received.push(relayed),
    );
    stop();

    process.emit("message", { type: "peer-event", event });

    expect(received).toEqual([]);
    expect(process.listenerCount("message")).toBe(0);
  });
});
