import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";

// Views and caches follow changes another process of the runtime made.
describe("messaging.observe", () => {
  it("hands a plugin the events a peer process relays", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const studio = createServicePluginContext(shell, "studio");
    const seen: unknown[] = [];
    studio.messaging.observe("entity:updated", async (message) => {
      seen.push(message.payload);
      return { success: true };
    });

    await shell.getMessageBus().deliverPeer("entity:updated", {
      entityId: "imported",
    });

    expect(seen).toEqual([{ entityId: "imported" }]);
  });

  it("observes nothing in a worker process, which serves no views", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const worker = createServicePluginContext(shell, "studio", {
      executionOnly: true,
    });
    const seen: unknown[] = [];
    worker.messaging.observe("entity:updated", async (message) => {
      seen.push(message.payload);
      return { success: true };
    });

    await shell.getMessageBus().deliverPeer("entity:updated", {
      entityId: "imported",
    });

    expect(seen).toEqual([]);
  });
});
