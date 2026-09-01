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

describe("what a subscription handler can read", () => {
  it("answers from the brain's own records and identity", async () => {
    const definition = defineServicePlugin({
      id: "metadata-desk",
      config: z.object({}),
      setup: () => ({}),
      subscriptions: () => [
        defineSubscription({
          topic: "site:metadata:get",
          payload: z.object({}),
          handle: async ({ entities, identity }) => {
            const stored = await entities.getEntity({
              entityType: "site-info",
              id: "site-info",
              visibilityScope: "restricted",
            });
            return {
              stored: stored !== null,
              // Falling back to the brain's own name is the whole reason
              // this handler needs more than its payload.
              title: identity.getProfile().name,
            };
          },
        }),
      ],
    });

    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/metadata-desk"),
    );

    const response = await harness.sendMessage("site:metadata:get", {});
    expect(response).toMatchObject({
      stored: false,
      title: expect.any(String),
    });
  });
});

describe("a subscription that announces rather than answers", () => {
  it("can publish, so a change on one topic becomes meaning on another", async () => {
    const definition = defineServicePlugin({
      id: "metadata-herald",
      config: z.object({}),
      setup: () => ({}),
      subscriptions: () => [
        defineSubscription({
          topic: "entity:updated",
          payload: z.object({ entityType: z.string() }),
          handle: async ({ payload, messaging }) => {
            if (payload.entityType !== "site-info") return;
            await messaging.send({
              type: "site:metadata:updated",
              payload: { title: "Rebuilt" },
            });
          },
        }),
      ],
    });

    const harness = createPluginHarness();
    const announced: unknown[] = [];
    harness.subscribe("site:metadata:updated", async (message) => {
      announced.push(message.payload);
      return { success: true };
    });
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/metadata-herald"),
    );

    await harness.sendMessage("entity:updated", { entityType: "note" });
    expect(announced).toEqual([]);

    await harness.sendMessage("entity:updated", { entityType: "site-info" });
    expect(announced).toEqual([{ title: "Rebuilt" }]);
  });
});
