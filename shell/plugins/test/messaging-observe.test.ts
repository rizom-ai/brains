import { describe, expect, it } from "bun:test";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";
import { defineChannel, entityUpdatedChannel } from "../src";

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
    worker.messaging.observe(entityUpdatedChannel, async (payload) => {
      seen.push(payload);
      return { success: true };
    });

    await shell.getMessageBus().deliverPeer("entity:updated", {
      entityType: "note",
      entityId: "imported",
    });

    expect(seen).toEqual([]);
  });

  describe("with a channel", () => {
    it("hands the handler the validated payload, from this process and its peers", async () => {
      const shell = createMockShell({ logger: createSilentLogger() });
      const studio = createServicePluginContext(shell, "studio");
      const seen: Array<{ entityType: string; entityId: string }> = [];
      studio.messaging.observe(entityUpdatedChannel, async (payload) => {
        seen.push({
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
        return { success: true };
      });

      await shell.getMessageBus().send({
        type: entityUpdatedChannel.name,
        payload: { entityType: "note", entityId: "local" },
        sender: "entity-service",
        broadcast: true,
      });
      await shell.getMessageBus().deliverPeer(entityUpdatedChannel.name, {
        entityType: "note",
        entityId: "imported",
      });

      expect(seen).toEqual([
        { entityType: "note", entityId: "local" },
        { entityType: "note", entityId: "imported" },
      ]);
    });

    it("refuses a malformed payload instead of reading it as undefined", async () => {
      const logger = createMockLogger();
      const shell = createMockShell({ logger });
      const studio = createServicePluginContext(shell, "studio");
      const seen: unknown[] = [];
      studio.messaging.observe(entityUpdatedChannel, async (payload) => {
        seen.push(payload);
        return { success: true };
      });

      const response = await shell.getMessageBus().send({
        type: entityUpdatedChannel.name,
        payload: { entityId: "no-type" },
        sender: "test",
      });
      await shell.getMessageBus().deliverPeer(entityUpdatedChannel.name, {
        entityId: "no-type",
      });

      expect(seen).toEqual([]);
      expect(response).toEqual({
        success: false,
        error: "Invalid entity:updated payload",
      });
      expect(logger.warn).toHaveBeenCalledWith(
        "Refused an invalid entity:updated payload",
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it("stops hearing the channel once unsubscribed", async () => {
      const shell = createMockShell({ logger: createSilentLogger() });
      const studio = createServicePluginContext(shell, "studio");
      const seen: unknown[] = [];
      const channel = defineChannel(
        "test:observed",
        z.object({ n: z.number() }),
      );
      const unsubscribe = studio.messaging.observe(channel, async (payload) => {
        seen.push(payload.n);
        return { success: true };
      });

      unsubscribe();
      await shell.getMessageBus().deliverPeer(channel.name, { n: 1 });

      expect(seen).toEqual([]);
    });
  });
});

// Work tied to where an event happens runs in every process, each for the
// events it raises itself.
describe("messaging.subscribeExecution with a channel", () => {
  it("hands the handler the validated payload in a worker too", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const worker = createServicePluginContext(shell, "topics", {
      executionOnly: true,
    });
    const seen: string[] = [];
    worker.messaging.subscribeExecution(
      entityUpdatedChannel,
      async (payload) => {
        seen.push(payload.entityType);
        return { success: true };
      },
    );

    await shell.getMessageBus().send({
      type: entityUpdatedChannel.name,
      payload: { entityType: "note", entityId: "a" },
      sender: "entity-service",
      broadcast: true,
    });

    expect(seen).toEqual(["note"]);
  });

  it("does not hear a peer's events", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "topics");
    const seen: unknown[] = [];
    context.messaging.subscribeExecution(
      entityUpdatedChannel,
      async (payload) => {
        seen.push(payload);
        return { success: true };
      },
    );

    await shell.getMessageBus().deliverPeer(entityUpdatedChannel.name, {
      entityType: "note",
      entityId: "imported",
    });

    expect(seen).toEqual([]);
  });

  it("refuses a malformed payload", async () => {
    const logger = createMockLogger();
    const shell = createMockShell({ logger });
    const context = createServicePluginContext(shell, "topics");
    const seen: unknown[] = [];
    context.messaging.subscribeExecution(
      entityUpdatedChannel,
      async (payload) => {
        seen.push(payload);
        return { success: true };
      },
    );

    const response = await shell.getMessageBus().send({
      type: entityUpdatedChannel.name,
      payload: { entityType: 42, entityId: "a" },
      sender: "test",
    });

    expect(seen).toEqual([]);
    expect(response).toEqual({
      success: false,
      error: "Invalid entity:updated payload",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Refused an invalid entity:updated payload",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
