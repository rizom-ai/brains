import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { interfaceStateNamespaceFor } from "../src/internal/state-namespace";
import {
  defineMessageInterface,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * Four things a real message interface needs that the declarative surface
 * could not say. Each is here because `@brains/email` needs it: it validates
 * an address as a channel subject, keeps an IMAP cursor across restarts,
 * boots inbound-only when its outbound credentials are absent, and answers a
 * request for the source of a message it delivered.
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

describe("declarative message interface: channel subject pattern", () => {
  it("carries the pattern onto the registered descriptor", async () => {
    const definition = defineMessageInterface(
      {
        id: "post",
        config: z.object({}),
        channel: {
          type: "post",
          displayName: "Post",
          subjectLabel: "Address",
          subjectPattern: { source: "^[^@\\s]+@[^@\\s]+$", flags: "i" },
          recipient: z.string().min(1),
        },
      },
      {
        deliver: ({ recipient }) => `sent:${recipient}`,
      },
    );
    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(definition, {}, "@fixture/post"));
    await harness.finalizeRegistration();

    const descriptor = harness
      .getMockShell()
      .getChannelRegistry()
      .getDescriptor("post");
    expect(descriptor?.subjectPattern).toEqual({
      source: "^[^@\\s]+@[^@\\s]+$",
      flags: "i",
    });
  });
});

describe("declarative message interface: delivery availability", () => {
  it("registers the channel but no provider when the declaration is unavailable", async () => {
    const definition = defineMessageInterface(
      {
        id: "halfwired",
        config: z.object({ apiKey: z.string().optional() }),
        channel: {
          type: "halfwired",
          displayName: "Halfwired",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
      },
      {
        // Configured inbound-only: the channel still exists, delivery does not.
        available: ({ config }) => Boolean(config.apiKey),
        deliver: ({ recipient }) => `sent:${recipient}`,
      },
    );
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/halfwired"),
    );
    await harness.finalizeRegistration();

    const registry = harness.getMockShell().getChannelRegistry();
    // The channel exists — it still receives — but nothing advertises that it
    // can be delivered to.
    expect(registry.getDescriptor("halfwired")).toBeDefined();
    expect(registry.getDeliveryProvider("halfwired")).toBeUndefined();
  });

  it("reports available once the configuration carries the credential", async () => {
    const definition = defineMessageInterface(
      {
        id: "wired",
        config: z.object({ apiKey: z.string().optional() }),
        channel: {
          type: "wired",
          displayName: "Wired",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
      },
      {
        available: ({ config }) => Boolean(config.apiKey),
        deliver: ({ recipient }) => `sent:${recipient}`,
      },
    );
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, { apiKey: "key" }, "@fixture/wired"),
    );
    await harness.finalizeRegistration();

    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("wired");
    if (!provider) throw new Error("provider absent");
    expect(await provider.isAvailable()).toBeTrue();
  });
});

describe("declarative message interface: durable state in setup", () => {
  it("persists setup writes in package-qualified interface state", async () => {
    const cursorSchema = z.strictObject({ lastUid: z.number().int() });
    const seen: number[] = [];

    const build = (): ReturnType<typeof defineMessageInterface> =>
      defineMessageInterface(
        {
          id: "cursored",
          config: z.object({}),
          setup: async ({ runtimeState }) => {
            const store = runtimeState({
              namespace: "cursor",
              schema: cursorSchema,
            });
            const current = await store.get("inbox");
            seen.push(current?.lastUid ?? 0);
            await store.set("inbox", { lastUid: (current?.lastUid ?? 0) + 1 });
            return { store };
          },
          channel: {
            type: "cursored",
            displayName: "Cursored",
            subjectLabel: "Address",
            recipient: z.string().min(1),
          },
        },
        {
          deliver: ({ recipient }) => `sent:${recipient}`,
        },
      );

    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(build(), {}, "@fixture/cursored"));
    await harness.finalizeRegistration();

    // setup saw an empty cursor and advanced it.
    expect(seen).toEqual([0]);

    // The shell can read the write under the package-and-declaration owner.
    // Declaration-only legacy keys are not adopted by the interface.
    const stored = await harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: interfaceStateNamespaceFor(
          "@fixture/cursored",
          "cursored",
          "cursor",
        ),
        schema: cursorSchema,
      })
      .get("inbox");
    expect(stored).toEqual({ lastUid: 1 });
  });
});

describe("declarative message interface: subscriptions", () => {
  it("answers a request on its declared topic with a validated payload", async () => {
    const definition = defineMessageInterface(
      {
        id: "answering",
        config: z.object({}),
        channel: {
          type: "answering",
          displayName: "Answering",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
      },
      {
        subscriptions: () => [
          defineSubscription({
            topic: "answering:lookup",
            payload: z.object({ id: z.string() }),
            // payload is typed here, which is the point of the helper
            handle: ({ payload }) => ({ found: `entry-${payload.id}` }),
          }),
        ],
        deliver: ({ recipient }) => `sent:${recipient}`,
      },
    );
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/answering"),
    );
    await harness.finalizeRegistration();

    const response = await harness.sendMessage("answering:lookup", {
      id: "7",
    });
    expect(response).toEqual({ found: "entry-7" });
  });
});

describe("declarative message interface: the delivery envelope", () => {
  it("hands deliver the whole envelope and honours a structured failure", async () => {
    const seen: unknown[] = [];
    const definition = defineMessageInterface(
      {
        id: "enveloped",
        config: z.object({}),
        channel: {
          type: "enveloped",
          displayName: "Enveloped",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
      },
      {
        deliver: ({ delivery }) => {
          seen.push(delivery);
          // A transport that knows why it failed says so, rather than throwing
          // and being flattened to one generic code.
          return { status: "failed", failureCode: "enveloped_rejected" };
        },
      },
    );
    const harness = createPluginHarness();
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/enveloped"),
    );
    await harness.finalizeRegistration();

    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("enveloped");
    if (!provider) throw new Error("provider absent");

    const result = await provider.send({
      recipient: "ops@example.com",
      subject: "Alert",
      text: "Ready",
      idempotencyKey: "key-1",
      html: "<p>Ready</p>",
      sensitivity: "secret",
      threading: { inReplyTo: "<a@x>", references: ["<a@x>"] },
    });

    expect(result).toEqual({
      status: "failed",
      failureCode: "enveloped_rejected",
    });
    expect(seen[0]).toMatchObject({
      subject: "Alert",
      text: "Ready",
      idempotencyKey: "key-1",
      html: "<p>Ready</p>",
      sensitivity: "secret",
      threading: { inReplyTo: "<a@x>", references: ["<a@x>"] },
    });
  });
});

describe("declarative message interface: reaching the bus from setup", () => {
  it("publishes on a topic another package listens to", async () => {
    const definition = defineMessageInterface(
      {
        id: "publisher",
        config: z.object({}),
        // An interface that takes delivery of something external has to be able
        // to hand it on, and to say so in the log; nothing else can.
        setup: async ({ messaging, logger }) => {
          logger.debug("publisher ready");
          await messaging.request({
            type: "publisher:arrived",
            payload: { id: "letter-1" },
          });
          return {};
        },
        channel: {
          type: "publisher",
          displayName: "Publisher",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
      },
      {
        deliver: ({ recipient }) => `sent:${recipient}`,
      },
    );
    const harness = createPluginHarness();
    const received: unknown[] = [];
    harness.subscribe("publisher:arrived", async (message) => {
      received.push(message.payload);
      return { success: true, data: {} };
    });
    await harness.installPlugin(
      instantiate(definition, {}, "@fixture/publisher"),
    );
    await harness.finalizeRegistration();

    expect(received).toEqual([{ id: "letter-1" }]);
  });
});
