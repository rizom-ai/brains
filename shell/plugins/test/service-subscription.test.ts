import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A service that answers a request on the bus.
 *
 * `@brains/notifications` is one subscription and nothing else: it takes a
 * request, resolves a transport by the recipient's channel type, and sends.
 * Reactions cover checks, inbox actions and tools — none of them is a request
 * arriving on the bus.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
  name: string,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

describe("declarative service subscriptions", () => {
  it("answers its declared topic with a validated payload", async () => {
    const definition = defineServicePlugin({
      id: "answering-service",
      config: z.object({}),
      subscriptions: () => [
        defineSubscription({
          topic: "answering-service:lookup",
          payload: z.object({ id: z.string() }),
          handle: ({ payload }) => ({ found: `entry-${payload.id}` }),
        }),
      ],
    });
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/answering-service"),
    );
    await harness.finalizeRegistration();

    const response = await harness.sendMessage("answering-service:lookup", {
      id: "7",
    });
    expect(response).toEqual({ found: "entry-7" });
  });

  it("refuses a malformed request instead of handing it to the handler", async () => {
    let handled = 0;
    const definition = defineServicePlugin({
      id: "strict-service",
      config: z.object({}),
      subscriptions: () => [
        defineSubscription({
          topic: "strict-service:lookup",
          payload: z.object({ id: z.string() }),
          handle: () => {
            handled += 1;
            return { ok: true };
          },
        }),
      ],
    });
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/strict-service"),
    );
    await harness.finalizeRegistration();

    await harness.sendMessage("strict-service:lookup", { id: 7 });
    expect(handled).toBe(0);
  });

  it("resolves a transport through the granted channel reader", async () => {
    const definition = defineServicePlugin({
      id: "routing-service",
      config: z.object({}),
      setup: ({ channels, logger }) => {
        logger.debug("routing ready");
        return { channels };
      },
      subscriptions: ({ state }) => [
        defineSubscription({
          topic: "routing-service:send",
          payload: z.object({ channelType: z.string(), text: z.string() }),
          handle: async ({ payload }) => {
            const provider = state.channels.getDeliveryProvider(
              payload.channelType,
            );
            if (!provider || !(await provider.isAvailable())) {
              return { sent: false };
            }
            const result = await provider.send({
              recipient: "someone@example.com",
              subject: "Alert",
              text: payload.text,
              idempotencyKey: "key-1",
            });
            return { sent: result.status === "sent" };
          },
        }),
      ],
    });
    const harness = createPluginHarness();
    const registry = harness.getMockShell().getChannelRegistry();
    // A provider only exists for a channel someone owns, so the descriptor
    // comes first — the registry refuses an orphan provider.
    registry.registerDescriptor("@fixture/probe", {
      type: "probe",
      displayName: "Probe",
      subjectLabel: "Address",
    });
    registry.registerDeliveryProvider("@fixture/probe", {
      channelType: "probe",
      isAvailable: () => Promise.resolve(true),
      send: () => Promise.resolve({ status: "sent" as const }),
    });
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/routing-service"),
    );
    await harness.finalizeRegistration();

    const response = await harness.sendMessage("routing-service:send", {
      channelType: "probe",
      text: "Ready",
    });
    expect(response).toEqual({ sent: true });
  });
});
