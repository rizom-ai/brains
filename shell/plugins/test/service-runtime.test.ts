import { describe, expect, it } from "bun:test";
import { defineBusContract, defineChannel } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
} from "../src";

/**
 * A first-party service converted from a class answers the first-party
 * contracts its class answered, under their channel names and in the
 * processes the class answered them in, and hears the system channels its
 * class subscribed to. `serviceRuntime(context)` reaches that from the
 * subscriptions slot; a context the runtime did not build has none.
 */

// A first-party contract whose channel names no package: as notifications:send.
const deliver = defineBusContract({
  channel: "probe:deliver",
  request: z.object({ title: z.string() }),
  response: z.object({ status: z.enum(["sent", "failed"]) }),
  delivery: "request",
});

const settled = defineChannel("probe:settled", z.object({ round: z.number() }));

const metadata = { name: "@brains/probe", version: "0.1.0" };

interface Heard {
  readonly requests: { title: string; sender: string }[];
  readonly events: unknown[];
}

function probe(options: {
  everyProcess?: boolean;
  mode?: "subscribe" | "observe" | "execution";
  heard: Heard;
}): Parameters<typeof instantiatePluginPackageDefinition>[0] {
  return defineServicePlugin(
    { id: "probe", config: z.object({}) },
    {
      subscriptions: (context) => {
        const runtime = serviceRuntime(context);
        runtime.answer(
          deliver,
          ({ request, sender }) => {
            options.heard.requests.push({ title: request.title, sender });
            runtime.logger.info("Delivered", { title: request.title });
            return { status: "sent" };
          },
          options.everyProcess ? { everyProcess: true } : {},
        );
        runtime.listen(
          settled,
          ({ payload }) => {
            options.heard.events.push(payload);
          },
          options.mode ? { mode: options.mode } : {},
        );
        return [];
      },
    },
  );
}

async function install(
  shell: MockShell,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  executionOnly = false,
): Promise<Plugin> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    metadata,
    {
      pluginId: "probe",
    },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell, { executionOnly });
  return plugin;
}

function emptyHeard(): Heard {
  return { requests: [], events: [] };
}

describe("a first-party service's runtime", () => {
  it("answers a first-party contract under its own channel, as the package", async () => {
    const shell = createMockShell();
    const heard = emptyHeard();
    await install(shell, probe({ heard }));

    const asker = createServicePluginContext(shell, "contact");
    expect(await asker.messaging.request(deliver, { title: "Hello" })).toEqual({
      status: "answered",
      data: { status: "sent" },
    });
    expect(heard.requests).toEqual([{ title: "Hello", sender: "contact" }]);
  });

  it("answers in a worker only when it answers in every process", async () => {
    const answering = createMockShell();
    await install(
      answering,
      probe({ heard: emptyHeard(), everyProcess: true }),
      true,
    );
    expect(
      await createServicePluginContext(answering, "contact").messaging.request(
        deliver,
        { title: "Hello" },
      ),
    ).toEqual({ status: "answered", data: { status: "sent" } });

    const silent = createMockShell();
    await install(silent, probe({ heard: emptyHeard() }), true);
    expect(
      await createServicePluginContext(silent, "contact").messaging.request(
        deliver,
        { title: "Hello" },
      ),
    ).toEqual({ status: "unavailable" });
  });

  it("refuses an answer outside the contract", async () => {
    const shell = createMockShell();
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            serviceRuntime(context).answer(deliver, () =>
              // @ts-expect-error an answer outside the contract
              ({ status: "lost" }),
            );
            return [];
          },
        },
      ),
    );
    const asked = await createServicePluginContext(
      shell,
      "contact",
    ).messaging.request(deliver, { title: "Hello" });
    expect(asked.status).toBe("failed");
  });

  it("hears a system channel in the main process, and not in a worker", async () => {
    const main = createMockShell();
    const heard = emptyHeard();
    await install(main, probe({ heard }));
    await main
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 1 }, sender: "shell" });
    expect(heard.events).toEqual([{ round: 1 }]);

    const worker = createMockShell();
    const unheard = emptyHeard();
    await install(worker, probe({ heard: unheard }), true);
    await worker
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 1 }, sender: "shell" });
    expect(unheard.events).toEqual([]);
  });

  it("hears a channel in a worker too when it listens in every process", async () => {
    const worker = createMockShell();
    const heard = emptyHeard();
    await install(worker, probe({ heard, mode: "execution" }), true);
    await worker
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 2 }, sender: "shell" });
    expect(heard.events).toEqual([{ round: 2 }]);
  });

  it("observes a channel from the main process, and not from a worker", async () => {
    const main = createMockShell();
    const heard = emptyHeard();
    await install(main, probe({ heard, mode: "observe" }));
    await main
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 4 }, sender: "shell" });
    expect(heard.events).toEqual([{ round: 4 }]);

    const worker = createMockShell();
    const unheard = emptyHeard();
    await install(worker, probe({ heard: unheard, mode: "observe" }), true);
    await worker
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 4 }, sender: "shell" });
    expect(unheard.events).toEqual([]);
  });

  it("hears a channel by name, its payload as sent", async () => {
    const shell = createMockShell();
    const heard: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            serviceRuntime(context).listen("probe:named", ({ payload }) => {
              heard.push(payload);
            });
            return [];
          },
        },
      ),
    );
    await shell.getMessageBus().send({
      type: "probe:named",
      payload: { any: "thing" },
      sender: "shell",
    });
    expect(heard).toEqual([{ any: "thing" }]);
  });

  it("drops a payload its channel refuses", async () => {
    const shell = createMockShell();
    const heard = emptyHeard();
    await install(shell, probe({ heard }));
    await shell
      .getMessageBus()
      .send({ type: settled.name, payload: { round: "x" }, sender: "shell" });
    expect(heard.events).toEqual([]);
  });

  it("releases what it answers and hears when the package shuts down", async () => {
    const shell = createMockShell();
    const heard = emptyHeard();
    const plugin = await install(shell, probe({ heard }));
    await plugin.shutdown?.();

    expect(
      await createServicePluginContext(shell, "contact").messaging.request(
        deliver,
        { title: "Hello" },
      ),
    ).toEqual({ status: "unavailable" });
    await shell
      .getMessageBus()
      .send({ type: settled.name, payload: { round: 3 }, sender: "shell" });
    expect(heard.events).toEqual([]);
  });

  it("logs as the package", async () => {
    const logger = createMockLogger();
    const shell = createMockShell({ logger });
    await install(shell, probe({ heard: emptyHeard() }));
    await createServicePluginContext(shell, "contact").messaging.request(
      deliver,
      { title: "Hello" },
    );
    expect(logger.info).toHaveBeenCalledWith("Delivered", { title: "Hello" });
  });

  it("finds the delivery provider registered for a channel type", async () => {
    const shell = createMockShell();
    const registry = shell.getChannelRegistry();
    registry.registerDescriptor("email-transport", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    const provider = {
      channelType: "email",
      isAvailable: async (): Promise<boolean> => true,
      send: async (): Promise<{ status: "sent" }> => ({ status: "sent" }),
    };
    registry.registerDeliveryProvider("email-transport", provider);
    registry.finalize();
    const found: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const runtime = serviceRuntime(context);
            runtime.answer(deliver, () => {
              found.push(
                runtime.deliveryProvider("email"),
                runtime.deliveryProvider("slack"),
              );
              return { status: "sent" };
            });
            return [];
          },
        },
      ),
    );
    await createServicePluginContext(shell, "contact").messaging.request(
      deliver,
      { title: "Hello" },
    );
    expect(found[0]).toMatchObject({ channelType: "email" });
    expect(found[1]).toBeUndefined();
  });

  it("is refused on a context the runtime did not build", () => {
    expect(() => serviceRuntime({})).toThrow(/first-party packages only/);
  });
});

describe("a first-party service's runtime, once the brain is ready", () => {
  it("runs its ready handlers when the brain is ready, in order, as the package", async () => {
    const shell = createMockShell();
    const order: string[] = [];
    const plugin = await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const runtime = serviceRuntime(context);
            runtime.ready(() => {
              order.push("first");
            });
            runtime.ready(async () => {
              order.push("second");
            });
            return [];
          },
        },
      ),
    );
    expect(order).toEqual([]);

    await plugin.ready?.();
    expect(order).toEqual(["first", "second"]);
  });

  it("reads the shape of every registered type, and where the brain keeps its data", async () => {
    const shell = createMockShell({ dataDir: "/tmp/probe-data" });
    const registry = shell.getEntityRegistry();
    registry.registerEntityType(
      "note",
      baseEntitySchema,
      createTestEntityAdapter("note"),
    );
    // The mock registry keeps no extensions; answer as the real one would.
    registry.getEffectiveFrontmatterSchema = (
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined =>
      type === "note" ? z.object({ title: z.string() }) : undefined;
    registry.registerEntityType(
      "site-info",
      baseEntitySchema,
      createTestEntityAdapter("site-info", { isSingleton: true }),
    );
    const read: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const { entityShapes, dataDir } = serviceRuntime(context);
            read.push(
              dataDir,
              entityShapes.types(),
              Object.keys(entityShapes.frontmatterSchema("note")?.shape ?? {}),
              entityShapes.frontmatterSchema("missing"),
              entityShapes.isSingleton("site-info"),
              entityShapes.isSingleton("note"),
              entityShapes.isSingleton("missing"),
              typeof entityShapes.bodyTemplate("note"),
              entityShapes.bodyTemplate("missing"),
            );
            return [];
          },
        },
      ),
    );
    expect(read).toEqual([
      "/tmp/probe-data",
      ["note", "site-info"],
      ["title"],
      undefined,
      true,
      false,
      false,
      "string",
      "",
    ]);
  });
});

describe("a first-party service's runtime, reading the brain", () => {
  it("reads the brain's character, its anchor's profile and its domain as the shell keeps them", async () => {
    const shell = createMockShell({ domain: "brain.example" });
    const read: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const { identity, domain } = serviceRuntime(context);
            read.push(identity.get().name, identity.getProfile().name, domain);
            return [];
          },
        },
      ),
    );

    expect(read).toEqual(["Test Brain", "Test Owner", "brain.example"]);
  });

  it("has no domain when the brain names none", async () => {
    const shell = createMockShell();
    const read: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            read.push(serviceRuntime(context).domain);
            return [];
          },
        },
      ),
    );

    expect(read).toEqual([undefined]);
  });
});
