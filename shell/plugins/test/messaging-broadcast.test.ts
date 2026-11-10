import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";
import { defineChannel, type Channel } from "../src";

const settled: Channel<{ round: number }> = defineChannel(
  "probe:settled",
  z.object({ round: z.number() }),
);

/** What the bus delivered on the channel: each payload with its sender. */
function hear(
  shell: ReturnType<typeof createMockShell>,
): { payload: unknown; source: string }[] {
  const heard: { payload: unknown; source: string }[] = [];
  shell.getMessageBus().subscribe(settled.name, (message) => {
    heard.push({ payload: message.payload, source: message.source });
    return { success: true };
  });
  return heard;
}

describe("messaging.broadcast", () => {
  it("sends the event on its channel as the plugin", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const heard = hear(shell);
    const context = createServicePluginContext(shell, "directory-sync");

    await context.messaging.broadcast(settled, { round: 1 });

    expect(heard).toEqual([
      { payload: { round: 1 }, source: "directory-sync" },
    ]);
  });

  it("sends from a worker process too, which raises events of its own", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const heard = hear(shell);
    const worker = createServicePluginContext(shell, "directory-sync", {
      executionOnly: true,
    });

    await worker.messaging.broadcast(settled, { round: 2 });

    expect(heard).toEqual([
      { payload: { round: 2 }, source: "directory-sync" },
    ]);
  });

  it("refuses a payload its channel refuses, and nobody hears it", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const heard = hear(shell);
    const context = createServicePluginContext(shell, "directory-sync");

    const refused = context.messaging.broadcast(
      settled,
      // @ts-expect-error a payload outside the channel's type does not type-check either
      { round: "one" },
    );

    expect(refused).rejects.toThrow(settled.name);
    await refused.catch(() => undefined);
    expect(heard).toEqual([]);
  });
});
