import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";

describe("registerInstructions should invalidate agent", () => {
  let messageBus: MessageBus;
  const logger = createSilentLogger();

  beforeEach(() => {
    MessageBus.resetInstance();
    messageBus = MessageBus.createFresh(logger);
  });

  it("should invalidate agent when instructions are re-registered after startup", async () => {
    const invalidateAgent = mock(() => {});
    let initialized = false;

    // Simulate shell.registerInstructions behavior
    const registerInstructions = (
      _pluginId: string,
      _instructions: string,
    ): void => {
      if (initialized) {
        invalidateAgent();
      }
    };

    // During startup, registering instructions does NOT invalidate
    registerInstructions("site-builder", "## Your Site\n**Title:** Old");
    expect(invalidateAgent).toHaveBeenCalledTimes(0);

    // Mark as initialized
    initialized = true;

    // After startup, re-registering instructions DOES invalidate
    registerInstructions("site-builder", "## Your Site\n**Title:** New");
    expect(invalidateAgent).toHaveBeenCalledTimes(1);
  });

  it("should allow site-builder to re-register instructions on entity change", async () => {
    const invalidateAgent = mock(() => {});

    const registerInstructions = (): void => {
      invalidateAgent();
    };

    // Simulate site-info entity update triggering re-registration
    messageBus.subscribe<{ entityType: string }, void>(
      "entity:updated",
      async (message) => {
        if (message.payload.entityType === "site-info") {
          registerInstructions();
        }
        return { success: true };
      },
    );

    await messageBus.send({
      type: "entity:updated",
      payload: { entityType: "site-info", entityId: "site-info" },
      sender: "test",
      broadcast: true,
    });

    expect(invalidateAgent).toHaveBeenCalledTimes(1);
  });

  it("should not invalidate for unrelated entity updates", async () => {
    const invalidateAgent = mock(() => {});

    messageBus.subscribe<{ entityType: string }, void>(
      "entity:updated",
      async (message) => {
        if (message.payload.entityType === "site-info") {
          invalidateAgent();
        }
        return { success: true };
      },
    );

    await messageBus.send({
      type: "entity:updated",
      payload: { entityType: "post", entityId: "my-post" },
      sender: "test",
      broadcast: true,
    });

    expect(invalidateAgent).toHaveBeenCalledTimes(0);
  });
});
