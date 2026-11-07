import { describe, expect, expectTypeOf, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { PluginManager } from "../src/manager/pluginManager";
import { createPluginHarness } from "../src/test/harness";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineRoute,
  instantiatePluginPackageDefinition,
} from "../src";

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
  config: unknown = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

const deliveries = z.object({ total: z.number() });
const noConfig = z.object({});

/** Calls one of the plugin's routes as the web server would. */
async function call(
  plugin: Plugin,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const route = plugin.getWebRoutes?.().find((each) => each.path === path);
  if (!route) throw new Error(`Route ${path} is not served`);
  return route.handler(new Request(`http://brain${path}`, init));
}

/** An interface that counts the deliveries its webhook accepts. */
function deliveryWebhook(): ReturnType<
  typeof defineInterface<typeof noConfig>
> {
  return defineInterface(
    {
      id: "webhook",
      config: noConfig,
      setup: ({ runtimeState }) => ({
        deliveries: runtimeState({
          namespace: "deliveries",
          schema: deliveries,
        }),
      }),
    },
    {
      routes: ({ state }) => [
        defineRoute({
          method: "POST",
          path: "/deliver",
          security: { kind: "public" },
          response: deliveries,
          async handle() {
            const previous = await state.deliveries.get("count");
            const total = (previous?.total ?? 0) + 1;
            await state.deliveries.set("count", { total });
            return { total };
          },
        }),
      ],
    },
  );
}

/** A message interface that counts what it delivers. */
function deliveryChannel(): ReturnType<
  typeof defineMessageInterface<typeof noConfig>
> {
  return defineMessageInterface(
    {
      id: "webhook",
      config: noConfig,
      channel: {
        type: "counted",
        displayName: "Counted",
        subjectLabel: "Address",
        recipient: z.string(),
      },
      setup: ({ runtimeState }) => ({
        deliveries: runtimeState({
          namespace: "deliveries",
          schema: deliveries,
        }),
      }),
    },
    {
      async deliver({ state }) {
        const previous = await state.deliveries.get("count");
        const total = (previous?.total ?? 0) + 1;
        await state.deliveries.set("count", { total });
        return String(total);
      },
    },
  );
}

async function deliverTo(
  harness: ReturnType<typeof createPluginHarness>,
  channelType: string,
): Promise<unknown> {
  const provider = harness
    .getMockShell()
    .getChannelRegistry()
    .getDeliveryProvider(channelType);
  if (!provider) throw new Error(`No delivery provider for ${channelType}`);
  return provider.send({
    recipient: "ops",
    subject: "Count",
    text: "One more",
    idempotencyKey: crypto.randomUUID(),
  });
}

function storedCount(
  harness: ReturnType<typeof createPluginHarness>,
  namespace: string,
): Promise<unknown> {
  return harness
    .getMockShell()
    .getRuntimeState()
    .scoped({ namespace, schema: deliveries })
    .get("count");
}

describe("two-stage interface definitions", () => {
  it("defines an interface from its header alone", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const plugin = instantiate(
      defineInterface({ id: "header-only", config: noConfig }),
      "@fixture/header-only",
    );
    await harness.installPlugin(plugin);
    expect(plugin.getWebRoutes?.()).toEqual([]);
  });

  it("binds routes and daemons to the state the header's setup returns", async () => {
    const started: string[] = [];
    const definition = defineInterface(
      {
        id: "greeter",
        config: z.object({ greeting: z.string().default("Hello") }),
        setup: ({ config }) => ({
          greet: (name: string): string => `${config.greeting}, ${name}`,
        }),
      },
      {
        // Written before the slot that could have fixed the state's type.
        daemons: ({ state }) => [
          defineDaemon({
            id: "greeter",
            async run({ health, signal }) {
              started.push(state.greet("daemon"));
              health.ready();
              await new Promise<void>((resolve) =>
                signal.addEventListener("abort", () => resolve(), {
                  once: true,
                }),
              );
            },
          }),
        ],
        routes: ({ state }) => {
          expectTypeOf(state.greet).toEqualTypeOf<(name: string) => string>();
          return [
            defineRoute({
              method: "GET",
              path: "/greet",
              security: { kind: "public" },
              response: z.object({ message: z.string() }),
              handle: () => ({ message: state.greet("route") }),
            }),
          ];
        },
      },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const plugin = instantiate(definition, "@fixture/greeter");
    await harness.installPlugin(plugin);

    const greeted = await call(plugin, "/greet");
    expect(await greeted.json()).toEqual({ message: "Hello, route" });
    const registry = harness.getMockShell().getDaemonRegistry();
    await registry.start(`${plugin.id}:greeter`);
    expect(started).toEqual(["Hello, daemon"]);
    await registry.stop(`${plugin.id}:greeter`);
  });

  it("keeps runtime state under the owning package, so two packages declaring one interface id never share a record", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const alpha = instantiate(deliveryWebhook(), "@fixture/alpha");
    const beta = instantiate(deliveryWebhook(), "@fixture/beta");
    await harness.installPlugin(alpha);
    await harness.installPlugin(beta);

    const deliver = async (plugin: Plugin): Promise<unknown> =>
      (await call(plugin, "/deliver", { method: "POST" })).json();
    await deliver(alpha);
    await deliver(alpha);
    expect(await deliver(beta)).toEqual({ total: 1 });

    // The local namespace is qualified by the package, as a service's is.
    expect(await storedCount(harness, "fixture.alpha.deliveries")).toEqual({
      total: 2,
    });
    expect(await storedCount(harness, "fixture.beta.deliveries")).toEqual({
      total: 1,
    });
    expect(await storedCount(harness, "deliveries")).toBeNull();
    expect(await storedCount(harness, "webhook.deliveries")).toBeNull();
  });

  it("writes schema input to runtime state and reads its parsed output", async () => {
    const definition = defineInterface(
      {
        id: "parsed-state",
        config: noConfig,
        setup: ({ runtimeState }) => ({
          counts: runtimeState({
            namespace: "counts",
            schema: z.object({
              count: z.string().transform(Number),
              label: z.string().default("ready"),
            }),
          }),
        }),
      },
      {
        routes: ({ state }) => [
          defineRoute({
            method: "POST",
            path: "/round-trip",
            security: { kind: "public" },
            response: z.object({ count: z.number(), label: z.string() }),
            async handle() {
              await state.counts.set("one", { count: "7" });
              const read = await state.counts.get("one");
              if (!read) throw new Error("Missing state");
              expectTypeOf(read).toEqualTypeOf<{
                count: number;
                label: string;
              }>();
              return read;
            },
          }),
        ],
      },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const plugin = instantiate(definition, "@fixture/parsed-state");
    await harness.installPlugin(plugin);
    const answered = await call(plugin, "/round-trip", { method: "POST" });
    expect(await answered.json()).toEqual({ count: 7, label: "ready" });
  });

  it("releases what setup acquired, last first, when the interface shuts down", async () => {
    const released: string[] = [];
    const definition = defineInterface({
      id: "holder",
      config: noConfig,
      setup: ({ lifecycle }) => {
        lifecycle.onCleanup(() => {
          released.push("connection");
        });
        lifecycle.onCleanup(async () => {
          released.push("cache");
        });
        return {};
      },
    });
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const plugin = instantiate(definition, "@fixture/holder");
    await harness.installPlugin(plugin);
    expect(released).toEqual([]);
    await plugin.shutdown?.();
    expect(released).toEqual(["cache", "connection"]);
  });

  it("refuses behavior written into the header", () => {
    expect(() =>
      defineInterface({
        id: "misplaced",
        config: noConfig,
        // @ts-expect-error Behavior is the second argument, not part of the header.
        routes: () => [],
      }),
    ).toThrow(
      'Interface "misplaced" declares "routes" in its header; behavior is defineInterface\'s second argument',
    );
  });

  it("refuses a slot an interface does not have", () => {
    expect(() =>
      defineInterface(
        { id: "unknown-slot", config: noConfig },
        // @ts-expect-error An interface has no tools slot.
        { tools: () => [] },
      ),
    ).toThrow(
      'Interface "unknown-slot" declares "tools", which is not a behavior slot',
    );
  });
});

describe("two-stage message interface definitions", () => {
  it("binds the transport to the state the header's setup returns", async () => {
    const definition = defineMessageInterface(
      {
        id: "pager",
        config: z.object({ prefix: z.string() }),
        channel: {
          type: "pager",
          displayName: "Pager",
          subjectLabel: "Address",
          recipient: z.string().min(1),
        },
        setup: ({ config }) => ({ prefix: config.prefix }),
      },
      {
        deliver: ({ state, recipient, message }) => {
          expectTypeOf(state.prefix).toEqualTypeOf<string>();
          return `${state.prefix}:${recipient}:${message.text}`;
        },
      },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    await harness.installPlugin(
      instantiate(definition, "@fixture/pager", { prefix: "p" }),
    );
    await harness.finalizeRegistration();
    expect(await deliverTo(harness, "pager")).toEqual({
      status: "sent",
      providerDeliveryId: "p:ops:One more",
    });
  });

  it("keeps runtime state under the owning package, so two packages declaring one interface id never share a record", async () => {
    // Two channels of one type cannot both register, so each package runs in
    // a brain of its own, over one store.
    const alphaHarness = createPluginHarness({ logger: createSilentLogger() });
    const store = alphaHarness.getMockShell().getRuntimeState();
    const betaHarness = createPluginHarness({ logger: createSilentLogger() });
    betaHarness.getMockShell().getRuntimeState = (): typeof store => store;

    await alphaHarness.installPlugin(
      instantiate(deliveryChannel(), "@fixture/alpha"),
    );
    await alphaHarness.finalizeRegistration();
    await betaHarness.installPlugin(
      instantiate(deliveryChannel(), "@fixture/beta"),
    );
    await betaHarness.finalizeRegistration();

    await deliverTo(alphaHarness, "counted");
    await deliverTo(alphaHarness, "counted");
    expect(await deliverTo(betaHarness, "counted")).toEqual({
      status: "sent",
      providerDeliveryId: "1",
    });
    expect(await storedCount(alphaHarness, "fixture.alpha.deliveries")).toEqual(
      { total: 2 },
    );
    expect(await storedCount(alphaHarness, "fixture.beta.deliveries")).toEqual({
      total: 1,
    });
    expect(await storedCount(alphaHarness, "webhook.deliveries")).toBeNull();
  });

  it("keeps a generic and a message interface of one id in two packages apart", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const generic = instantiate(deliveryWebhook(), "@fixture/alpha");
    await harness.installPlugin(generic);
    await harness.installPlugin(
      instantiate(deliveryChannel(), "@fixture/beta"),
    );
    await harness.finalizeRegistration();

    await call(generic, "/deliver", { method: "POST" });
    await call(generic, "/deliver", { method: "POST" });
    expect(await deliverTo(harness, "counted")).toEqual({
      status: "sent",
      providerDeliveryId: "1",
    });
  });

  it("releases what setup acquired in the worker when the worker shuts down", async () => {
    const released: string[] = [];
    const definition = defineMessageInterface({
      id: "worker-held",
      config: noConfig,
      channel: {
        type: "worker-held",
        displayName: "Worker held",
        subjectLabel: "Address",
        recipient: z.string(),
      },
      setup: ({ lifecycle }) => {
        lifecycle.onCleanup(() => {
          released.push("client");
        });
        return {};
      },
    });
    const logger = createSilentLogger();
    const shell = createMockShell({ logger });
    const manager = PluginManager.createFresh(
      logger,
      shell.getDaemonRegistry(),
    );
    manager.setShell(shell);
    await manager.registerInterfaceChannels(
      [instantiate(definition, "@fixture/worker-held")],
      { executionOnly: true },
    );
    expect(released).toEqual([]);
    await manager.shutdownPlugins();
    expect(released).toEqual(["client"]);
  });

  it("refuses behavior written into the header", () => {
    expect(() =>
      defineMessageInterface({
        id: "misplaced",
        config: noConfig,
        channel: {
          type: "misplaced",
          displayName: "Misplaced",
          subjectLabel: "Address",
          recipient: z.string(),
        },
        // @ts-expect-error Behavior is the second argument, not part of the header.
        deliver: () => undefined,
      }),
    ).toThrow(
      'Message interface "misplaced" declares "deliver" in its header; behavior is defineMessageInterface\'s second argument',
    );
  });

  it("refuses a slot a message interface does not have", () => {
    expect(() =>
      defineMessageInterface(
        {
          id: "unknown-slot",
          config: noConfig,
          channel: {
            type: "unknown-slot",
            displayName: "Unknown",
            subjectLabel: "Address",
            recipient: z.string(),
          },
        },
        // @ts-expect-error A message interface has no routes slot.
        { routes: () => [] },
      ),
    ).toThrow(
      'Message interface "unknown-slot" declares "routes", which is not a behavior slot',
    );
  });
});
