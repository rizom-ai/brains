import { describe, it, expect, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import type { BaseMessage } from "@brains/messaging-service";
import { defineChannel, isChannel } from "../../src/utils/channels";
import { createBasePluginContext } from "../../src/base/context";
import { createMockShell } from "@brains/test-utils";
import { createSilentLogger } from "@brains/test-utils";

describe("Typed Message Channels", () => {
  describe("defineChannel", () => {
    it("should create a channel with name and schema", () => {
      const schema = z.object({ id: z.string() });
      const channel = defineChannel("test-channel", schema);

      expect(channel.name).toBe("test-channel");
      expect(channel.schema).toBe(schema);
    });
  });

  describe("isChannel", () => {
    it("should return true for Channel objects", () => {
      const channel = defineChannel("test", z.object({}));
      expect(isChannel(channel)).toBe(true);
    });

    it("should return false for strings", () => {
      expect(isChannel("test-channel")).toBe(false);
    });

    it("should return false for null and undefined", () => {
      expect(isChannel(null)).toBe(false);
      expect(isChannel(undefined)).toBe(false);
    });
  });

  describe("context.messaging.subscribe with Channel", () => {
    const logger = createSilentLogger();

    it("should accept a Channel and call handler with validated payload", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const schema = z.object({
        entityId: z.string(),
        entityType: z.string(),
      });
      const EntityCreatedChannel = defineChannel("entity:created", schema);

      const receivedPayloads: Array<{ entityId: string; entityType: string }> =
        [];

      // Subscribe with typed channel - handler receives validated payload directly
      context.messaging.subscribe(EntityCreatedChannel, async (payload) => {
        receivedPayloads.push(payload);
        return { success: true };
      });

      // Simulate sending a message through the message bus
      const messageBus = shell.getMessageBus();
      await messageBus.send({
        type: "entity:created",
        payload: { entityId: "123", entityType: "note" },
        sender: "other-plugin",
      });

      expect(receivedPayloads).toHaveLength(1);
      expect(receivedPayloads[0]).toEqual({
        entityId: "123",
        entityType: "note",
      });
    });

    it("should not call handler for invalid payloads", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const schema = z.object({
        entityId: z.string(),
        entityType: z.string(),
      });
      const EntityCreatedChannel = defineChannel("entity:created", schema);

      const handler = mock(async () => ({ success: true }));

      context.messaging.subscribe(EntityCreatedChannel, handler);

      // Send invalid payload (missing entityType)
      const messageBus = shell.getMessageBus();
      await messageBus.send({
        type: "entity:created",
        payload: { entityId: "123" },
        sender: "other-plugin",
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should pass base message metadata as second argument", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const schema = z.object({ data: z.string() });
      const TestChannel = defineChannel("test-channel", schema);

      const receivedMessages: BaseMessage[] = [];

      context.messaging.subscribe(TestChannel, async (_payload, message) => {
        receivedMessages.push(message);
        return { success: true };
      });

      const messageBus = shell.getMessageBus();
      await messageBus.send({
        type: "test-channel",
        payload: { data: "hello" },
        sender: "sender-plugin",
      });

      expect(receivedMessages).toHaveLength(1);
      const receivedMessage = receivedMessages[0];
      if (!receivedMessage) throw new Error("unreachable");
      expect(receivedMessage.source).toBe("sender-plugin");
      expect(receivedMessage.type).toBe("test-channel");
      // Payload should NOT be in the base message
      expect("payload" in receivedMessage).toBe(false);
    });

    it("should still support string-based subscribe (existing behavior)", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const receivedMessages: unknown[] = [];

      // String-based subscribe - receives full message
      context.messaging.subscribe("my-channel", async (message) => {
        receivedMessages.push(message);
        return { success: true };
      });

      const messageBus = shell.getMessageBus();
      await messageBus.send({
        type: "my-channel",
        payload: { foo: "bar" },
        sender: "other-plugin",
      });

      expect(receivedMessages).toHaveLength(1);
      expect(
        z.looseObject({ payload: z.unknown() }).parse(receivedMessages[0])
          .payload,
      ).toEqual({ foo: "bar" });
    });

    it("rejects a channel paired with a plain message handler", () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");
      const channel = defineChannel(
        "typed-channel",
        z.object({ id: z.string() }),
      );

      const unsubscribe = context.messaging.subscribe(
        // @ts-expect-error the handler below takes a whole message, so the
        // payload inferred from it does not match this channel's. Reported
        // against the channel because inference reads the handler first. The
        // implementation narrows the pair together rather than asserting each
        // half, and this pins that callers are still held to the two declared
        // overloads.
        channel,
        async (message: BaseMessage) => ({ success: true, data: message.id }),
      );
      // The pair is rejected at compile time only; at runtime the subscription
      // is still registered and hands back its unsubscribe.
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it("should return unsubscribe function for Channel-based subscribe", async () => {
      const shell = createMockShell({ logger });
      const context = createBasePluginContext(shell, "test-plugin");

      const schema = z.object({ value: z.number() });
      const NumberChannel = defineChannel("numbers", schema);

      const receivedValues: number[] = [];

      const unsubscribe = context.messaging.subscribe(
        NumberChannel,
        async (payload) => {
          receivedValues.push(payload.value);
          return { success: true };
        },
      );

      const messageBus = shell.getMessageBus();

      // First message should be received
      await messageBus.send({
        type: "numbers",
        payload: { value: 1 },
        sender: "sender",
      });
      expect(receivedValues).toEqual([1]);

      // Unsubscribe
      unsubscribe();

      // Second message should NOT be received
      await messageBus.send({
        type: "numbers",
        payload: { value: 2 },
        sender: "sender",
      });
      expect(receivedValues).toEqual([1]); // Still just [1]
    });
  });
});
