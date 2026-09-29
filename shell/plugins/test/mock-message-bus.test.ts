import { describe, expect, it } from "bun:test";
import { createMockMessageBus } from "../src/test/mock-message-bus";

function ping(extra: { broadcast?: boolean } = {}): {
  type: string;
  payload: Record<string, never>;
  sender: string;
} & {
  broadcast?: boolean;
} {
  return { type: "ping", payload: {}, sender: "test", ...extra };
}

describe("createMockMessageBus", () => {
  it("returns the first handler's response and stops there", async () => {
    const bus = createMockMessageBus();
    const seen: string[] = [];
    bus.subscribe("ping", async () => {
      seen.push("first");
      return { success: true, data: "first" };
    });
    bus.subscribe("ping", async () => {
      seen.push("second");
      return { success: true, data: "second" };
    });

    const response = await bus.send<Record<string, never>, string>(ping());

    expect(response).toEqual({ success: true, data: "first" });
    expect(seen).toEqual(["first"]);
  });

  it("runs every handler for a broadcast", async () => {
    const bus = createMockMessageBus();
    const seen: string[] = [];
    bus.subscribe("ping", async () => {
      seen.push("first");
      return { success: true };
    });
    bus.subscribe("ping", async () => {
      seen.push("second");
      return { success: true };
    });

    await bus.send(ping({ broadcast: true }));

    expect(seen).toEqual(["first", "second"]);
  });

  it("returns the runtime's coded no-handler refusal", async () => {
    // Missing request handlers must not look like successful responses.
    const bus = createMockMessageBus();
    const response = await bus.send({
      type: "unheard",
      payload: {},
      sender: "test",
    });
    expect(response).toEqual({
      success: false,
      code: "no_handler",
      error: "No handler found for message type: unheard",
    });
  });

  it("unsubscribes only the handler that asked", () => {
    const bus = createMockMessageBus();
    const unsubscribe = bus.subscribe("ping", async () => ({ success: true }));
    bus.subscribe("ping", async () => ({ success: true }));
    expect(bus.getHandlerCount("ping")).toBe(2);

    unsubscribe();

    expect(bus.getHandlerCount("ping")).toBe(1);
    expect(bus.hasHandlers?.("ping")).toBe(true);
  });

  it("collects a response from every handler", async () => {
    const bus = createMockMessageBus();
    bus.subscribe("ping", async () => ({ success: true, data: "a" }));
    bus.subscribe("ping", async () => ({ success: true, data: "b" }));

    const responses = await bus.collect<Record<string, never>, string>(ping());

    const data = responses.map((response) =>
      "data" in response ? response.data : undefined,
    );
    expect(data).toEqual(["a", "b"]);
  });

  it("clears one type without touching the others", () => {
    const bus = createMockMessageBus();
    bus.subscribe("ping", async () => ({ success: true }));
    bus.subscribe("pong", async () => ({ success: true }));

    bus.clearHandlers("ping");

    expect(bus.getHandlerCount("ping")).toBe(0);
    expect(bus.getHandlerCount("pong")).toBe(1);

    bus.clearAllHandlers();
    expect(bus.getHandlerCount("pong")).toBe(0);
  });

  it("does not count an untargeted subscription as targeted", () => {
    const bus = createMockMessageBus();
    bus.subscribe("ping", async () => ({ success: true }));
    expect(bus.getTargetedHandlerCount("ping", "somewhere")).toBe(0);
  });
});
