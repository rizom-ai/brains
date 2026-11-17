import { describe, expect, it } from "bun:test";
import { defineChannel } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class broadcasts an event on its
 * typed channel as its class did through context.messaging.broadcast:
 * every hearer gets the parsed payload from the package, and a payload the
 * channel refuses throws before anything is sent. Content-pipeline's
 * scheduler announces each publish this way.
 */

const published = defineChannel(
  "probe:published",
  z.object({ entityId: z.string().min(1) }),
);

describe("a first-party service's broadcasts", () => {
  it("reach every hearer from the package, parsed by the channel", async () => {
    const shell = createMockShell();
    const heard: unknown[] = [];
    shell.getMessageBus().subscribe("probe:published", async (message) => {
      heard.push({ payload: message.payload, sender: message.source });
      return { success: true };
    });
    const { runtime } = await probeService(shell);

    await runtime.messaging.broadcast(published, { entityId: "post-1" });

    expect(heard).toEqual([
      { payload: { entityId: "post-1" }, sender: "probe" },
    ]);
  });

  it("refuses a payload the channel refuses, sending nothing", async () => {
    const shell = createMockShell();
    const heard: unknown[] = [];
    shell.getMessageBus().subscribe("probe:published", async (message) => {
      heard.push(message.payload);
      return { success: true };
    });
    const { runtime } = await probeService(shell);

    expect(
      runtime.messaging.broadcast(published, { entityId: "" }),
    ).rejects.toThrow();
    expect(heard).toEqual([]);
  });
});
