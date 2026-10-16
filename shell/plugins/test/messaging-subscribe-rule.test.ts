import { describe, expect, it } from "bun:test";
import { ENTITY_CHANNELS } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { defineChannel } from "../src/utils/channels";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";
import { z } from "@brains/utils/zod";

// Entity and embedding events happen in every process of the runtime. A plain
// subscription hears one process only, so it takes observe or
// subscribeExecution instead.
describe("messaging.subscribe", () => {
  const handler = async (): Promise<{ success: boolean }> => ({
    success: true,
  });

  it.each(Object.values(ENTITY_CHANNELS))("refuses %s", (channel) => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "test");

    expect(() =>
      // @ts-expect-error entity events take observe or subscribeExecution
      context.messaging.subscribe(channel, handler),
    ).toThrow("observe or subscribeExecution");
  });

  it("refuses a typed channel for an entity event", () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "test");
    const channel = defineChannel(
      ENTITY_CHANNELS.created,
      z.object({ entityId: z.string() }),
    );

    expect(() => context.messaging.subscribe(channel, handler)).toThrow(
      "observe or subscribeExecution",
    );
  });

  it("refuses an entity event hidden behind a string", () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "test");
    const channel: string = ENTITY_CHANNELS.updated;

    expect(() => context.messaging.subscribe(channel, handler)).toThrow(
      "observe or subscribeExecution",
    );
  });

  it("still subscribes to other channels", () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "test");

    expect(() =>
      context.messaging.subscribe("publish:completed", handler),
    ).not.toThrow();
  });
});
