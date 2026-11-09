import { describe, expect, it } from "bun:test";
import { defineBusContract, defineChannel } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import {
  SYSTEM_CHANNELS,
  createServicePluginContext,
  createTemplate,
  defineDashboardWidget,
  defineServicePlugin,
  type DashboardWidgetRegistration,
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
  it("answers a contract every owner answers, beside the others", async () => {
    const gathered = defineBusContract({
      channel: "probe:context",
      request: z.object({ topic: z.string() }),
      response: z.object({ items: z.array(z.string()) }),
      delivery: "collect",
    });
    const shell = createMockShell();
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            serviceRuntime(context).answer(gathered, ({ request }) => ({
              items: [`probe on ${request.topic}`],
            }));
            return [];
          },
        },
      ),
    );
    createServicePluginContext(shell, "memory").messaging.answer(
      gathered,
      async ({ topic }) => ({ items: [`memory on ${topic}`] }),
    );

    const asked = await createServicePluginContext(
      shell,
      "agent",
    ).messaging.gather(gathered, { topic: "tides" });
    expect(asked.status).toBe("answered");
    expect(
      asked.status === "answered"
        ? asked.answers.flatMap(({ items }) => items).sort()
        : [],
    ).toEqual(["memory on tides", "probe on tides"]);
  });

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

describe("a first-party service's runtime, once every plugin has registered", () => {
  function finalizing(
    order: string[],
    fail = false,
  ): Parameters<typeof instantiatePluginPackageDefinition>[0] {
    return defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          const runtime = serviceRuntime(context);
          runtime.registered(() => {
            order.push("first");
          });
          runtime.registered(async () => {
            order.push("second");
            if (fail) throw new Error("Selected kind is not registered");
          });
          return [];
        },
      },
    );
  }

  it("runs its handlers when registration completes, in order, and not before", async () => {
    const order: string[] = [];
    const plugin = await install(createMockShell(), finalizing(order));
    expect(order).toEqual([]);

    await plugin.finalizeRegistration?.();
    expect(order).toEqual(["first", "second"]);
  });

  it("runs them in a worker too", async () => {
    const order: string[] = [];
    const plugin = await install(createMockShell(), finalizing(order), true);

    await plugin.finalizeRegistration?.();
    expect(order).toEqual(["first", "second"]);
  });

  it("fails registration when a handler fails", async () => {
    const plugin = await install(createMockShell(), finalizing([], true));

    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      "Selected kind is not registered",
    );
  });
});

describe("a first-party service's read-only view of the entity service", () => {
  async function reads(
    shell: MockShell,
  ): Promise<ReturnType<typeof serviceRuntime>["entityReads"]> {
    const captured: ReturnType<typeof serviceRuntime>["entityReads"][] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            captured.push(serviceRuntime(context).entityReads);
            return [];
          },
        },
      ),
    );
    const [view] = captured;
    if (!view) throw new Error("No entity reads");
    return view;
  }

  function seeded(): MockShell {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "note",
        baseEntitySchema,
        createTestEntityAdapter("note"),
      );
    const at = new Date().toISOString();
    shell.addEntities([
      {
        id: "public-note",
        entityType: "note",
        content: "Public",
        contentHash: "a",
        metadata: {},
        visibility: "public",
        created: at,
        updated: at,
      },
      {
        id: "private-note",
        entityType: "note",
        content: "Private",
        contentHash: "b",
        metadata: {},
        visibility: "restricted",
        created: at,
        updated: at,
      },
    ]);
    return shell;
  }

  it("reads types, public counts, lists and records as the entity service does", async () => {
    const view = await reads(seeded());

    expect(view.getEntityTypes()).toEqual(["note"]);
    expect(await view.getEntityCounts("public")).toEqual([
      { entityType: "note", count: 1 },
    ]);
    expect(
      (
        await view.listEntities({
          entityType: "note",
          options: { filter: { visibilityScope: "public" } },
        })
      ).map(({ id }) => id),
    ).toEqual(["public-note"]);
    // A full-scope read reaches a restricted record, as the class's did.
    expect(
      (
        await view.getEntity({
          entityType: "note",
          id: "private-note",
          visibilityScope: "restricted",
        })
      )?.content,
    ).toBe("Private");
    expect(
      await view.getEntity({ entityType: "note", id: "private-note" }),
    ).toBeNull();
  });

  it("offers no writes", async () => {
    const view = await reads(seeded());

    expect(Object.keys(view).sort()).toEqual([
      "getEntity",
      "getEntityCounts",
      "getEntityTypes",
      "listEntities",
      "search",
    ]);
  });
});

describe("a first-party service claiming a shell system type", () => {
  /** A shell with its identity types registered, as the shell registers them first. */
  function identityShell(): MockShell {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    for (const type of ["anchor-profile", "brain-character"]) {
      registry.registerEntityType(
        type,
        baseEntitySchema,
        createTestEntityAdapter(type, { isSingleton: true }),
      );
    }
    return shell;
  }

  function claiming(
    type: string,
    captured: ReturnType<ReturnType<typeof serviceRuntime>["claim"]>[],
    id = "probe",
  ): Parameters<typeof instantiatePluginPackageDefinition>[0] {
    return defineServicePlugin(
      { id, config: z.object({}) },
      {
        subscriptions: (context) => {
          captured.push(serviceRuntime(context).claim(type));
          return [];
        },
      },
    );
  }

  it("reads and writes the claimed type's stored records, as the package", async () => {
    const shell = identityShell();
    const captured: ReturnType<ReturnType<typeof serviceRuntime>["claim"]>[] =
      [];
    await install(shell, claiming("anchor-profile", captured));
    const [anchor] = captured;
    if (!anchor) throw new Error("No claim");

    await anchor.createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: "---\nname: Ada\n---\n",
        metadata: {},
      },
    });
    const stored = await anchor.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: "restricted",
    });
    if (!stored) throw new Error("Nothing stored");
    expect(stored.content).toBe("---\nname: Ada\n---\n");
    expect(
      (await anchor.listEntities({ entityType: "anchor-profile" })).map(
        ({ id }) => id,
      ),
    ).toEqual(["anchor-profile"]);

    await anchor.updateEntity({
      entity: { ...stored, content: "---\nname: Ada Lovelace\n---\n" },
    });
    expect(
      (
        await shell.getEntityService().getEntity({
          entityType: "anchor-profile",
          id: "anchor-profile",
        })
      )?.content,
    ).toBe("---\nname: Ada Lovelace\n---\n");
  });

  it("writes only while the record still has the hash it was read with", async () => {
    const shell = identityShell();
    const captured: ReturnType<ReturnType<typeof serviceRuntime>["claim"]>[] =
      [];
    await install(shell, claiming("anchor-profile", captured));
    const [anchor] = captured;
    if (!anchor) throw new Error("No claim");
    await anchor.createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: "---\nname: Ada\n---\n",
        metadata: {},
      },
    });
    const stored = await anchor.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });
    if (!stored) throw new Error("Nothing stored");

    const written = await anchor.updateEntity({
      entity: { ...stored, content: "---\nname: Changed\n---\n" },
      options: { expectedContentHash: "not-the-stored-hash" },
    });
    expect(written.skipReason).toBe("content-conflict");
  });

  it("refuses a record of another type", async () => {
    const shell = identityShell();
    const captured: ReturnType<ReturnType<typeof serviceRuntime>["claim"]>[] =
      [];
    await install(shell, claiming("anchor-profile", captured));
    const [anchor] = captured;
    if (!anchor) throw new Error("No claim");

    expect(
      anchor.createEntity({
        entity: {
          id: "brain-character",
          entityType: "brain-character",
          content: "",
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(
      anchor.getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("extends the claimed type's frontmatter and validates its writes", async () => {
    const shell = identityShell();
    const extended: string[] = [];
    shell.getEntityRegistry().extendFrontmatterSchema = (
      type,
      schema,
    ): void => {
      extended.push(`${type}:${Object.keys(schema.shape).join(",")}`);
    };
    const captured: ReturnType<ReturnType<typeof serviceRuntime>["claim"]>[] =
      [];
    await install(shell, claiming("anchor-profile", captured));
    const [anchor] = captured;
    if (!anchor) throw new Error("No claim");

    anchor.extendFrontmatterSchema(z.object({ tagline: z.string() }));
    anchor.registerPersistValidator(async (entity) => {
      if (entity.content.includes("forbidden")) throw new Error("Refused");
    });

    expect(extended).toEqual(["anchor-profile:tagline"]);
    expect(
      shell.getEntityRegistry().getPersistValidator("anchor-profile")?.(
        {
          id: "anchor-profile",
          entityType: "anchor-profile",
          content: "forbidden",
          contentHash: "x",
          metadata: {},
          visibility: "public",
          created: "",
          updated: "",
        },
        { operation: "update" },
      ),
    ).rejects.toThrow("Refused");
  });

  it("is refused for a second claim of the same type", async () => {
    const shell = identityShell();
    await install(shell, claiming("anchor-profile", []));

    const [second] = instantiatePluginPackageDefinition(
      claiming("anchor-profile", [], "importer"),
      {},
      { name: "@brains/importer", version: "0.1.0" },
      { pluginId: "importer" },
    );
    if (!second) throw new Error("No plugin");
    expect(second.register(shell)).rejects.toThrow(
      /already claimed by "probe"/,
    );
  });

  it("is refused for a type a plugin registers", async () => {
    const shell = identityShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "note",
        baseEntitySchema,
        createTestEntityAdapter("note"),
      );
    const [plugin] = instantiatePluginPackageDefinition(
      claiming("note", []),
      {},
      metadata,
      { pluginId: "probe" },
    );
    if (!plugin) throw new Error("No plugin");
    expect(plugin.register(shell)).rejects.toThrow(/not a shell system type/);
  });

  it("is refused for a shell system type nobody registered", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      claiming("anchor-profile", []),
      {},
      metadata,
      { pluginId: "probe" },
    );
    if (!plugin) throw new Error("No plugin");
    expect(plugin.register(createMockShell())).rejects.toThrow(
      /not registered/,
    );
  });

  it("is released when the package shuts down", async () => {
    const shell = identityShell();
    const first = await install(shell, claiming("anchor-profile", []));
    await first.shutdown?.();

    const [second] = instantiatePluginPackageDefinition(
      claiming("anchor-profile", [], "importer"),
      {},
      { name: "@brains/importer", version: "0.1.0" },
      { pluginId: "importer" },
    );
    if (!second) throw new Error("No plugin");
    expect(await second.register(shell)).toBeDefined();
  });
});

describe("a first-party service's profile kinds and AI", () => {
  it("registers a kind, and reads the selected one once registration completes", async () => {
    const shell = createMockShell({ profileKind: "gardener" });
    const read: unknown[] = [];
    const plugin = await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const runtime = serviceRuntime(context);
            runtime.profileKinds.register({
              kind: "gardener",
              category: "person",
              fields: z.object({ plot: z.string().optional() }),
              labels: { singular: "Gardener", plural: "Gardeners" },
            });
            runtime.registered(() => {
              read.push(
                runtime.profileKinds.getResolved(),
                Object.keys(
                  runtime.profileKinds.getSelectedDefinition()?.fields.shape ??
                    {},
                ),
              );
            });
            return [];
          },
        },
      ),
    );
    shell.getProfileKindRegistry().finalize();
    await plugin.finalizeRegistration?.();

    expect(read).toEqual([
      {
        kind: "gardener",
        category: "person",
        labels: { singular: "Gardener", plural: "Gardeners" },
      },
      ["plot"],
    ]);
  });

  it("asks the brain's AI for one structured answer", async () => {
    const shell = createMockShell();
    const prompts: string[] = [];
    shell.generateObject = async <T>(
      prompt: string,
      schema: { parse(value: unknown): T },
    ): Promise<{ object: T }> => {
      prompts.push(prompt);
      return { object: schema.parse({ role: "Gardener" }) };
    };
    const answered: unknown[] = [];
    await install(
      shell,
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            const runtime = serviceRuntime(context);
            runtime.ready(async () => {
              answered.push(
                await runtime.ai.generateObject(
                  "Who tends this brain?",
                  z.object({ role: z.string() }),
                ),
              );
            });
            return [];
          },
        },
      ),
    ).then((plugin) => plugin.ready?.());

    expect(prompts).toEqual(["Who tends this brain?"]);
    expect(answered).toEqual([{ object: { role: "Gardener" } }]);
  });
});

describe("a first-party service's data source, template and widget", () => {
  const mapData = z.object({ count: z.number() });

  function mapping(
    loads: string[],
  ): Parameters<typeof instantiatePluginPackageDefinition>[0] {
    return defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          const runtime = serviceRuntime(context);
          runtime.dataSource({
            id: "map",
            name: "Map",
            description: "The corpus",
            fetch: async (_query, { corpus }) => ({
              count: await corpus.countEntities({
                entityType: "note",
                options: { filter: { visibilityScope: "public" } },
              }),
            }),
          });
          runtime.template(
            "map",
            createTemplate({
              name: "map",
              description: "The corpus as a map",
              schema: mapData,
              dataSourceId: "probe:map",
              requiredPermission: "public",
              // A component returns an element, as a section's does.
              layout: {
                component: () => ({ type: "p", props: {}, key: null }),
              },
            }),
          );
          runtime.dashboardWidget({
            definition: defineDashboardWidget({
              id: "map",
              title: "Map",
              group: "knowledge",
              placement: "primary",
              priority: 30,
              permission: "public",
              data: mapData,
              view: () => ({ blocks: [] }),
            }),
            render: { component: () => null, clientStyles: ".map{}" },
            load: async ({ corpus, visibilityScope }) => {
              loads.push(visibilityScope);
              return {
                count: await corpus.countEntities({
                  entityType: "note",
                  options: { filter: { visibilityScope } },
                }),
              };
            },
          });
          return [];
        },
      },
    );
  }

  function noted(): MockShell {
    const shell = createMockShell();
    const at = new Date().toISOString();
    shell.addEntities(
      ["public", "restricted"].map((visibility) => ({
        id: `${visibility}-note`,
        entityType: "note",
        content: visibility,
        contentHash: visibility,
        metadata: {},
        visibility: visibility === "public" ? "public" : "restricted",
        created: at,
        updated: at,
      })),
    );
    return shell;
  }

  it("serves a data source under the plugin's id, reading at the build's scope", async () => {
    const shell = noted();
    await install(shell, mapping([]));

    const source = shell.getDataSourceRegistry().get("probe:map");
    if (!source?.fetch) throw new Error("No probe:map data source");
    expect(
      await source.fetch({}, mapData, {
        entityService: shell.getEntityService(),
      }),
    ).toEqual({ count: 1 });
  });

  it("registers a built template under the plugin's id, naming its data source", async () => {
    const shell = noted();
    await install(shell, mapping([]));

    const template = shell.getTemplates().get("probe:map");
    expect(template?.dataSourceId).toBe("probe:map");
    expect(template?.requiredPermission).toBe("public");
  });

  it("registers its widget with its own renderer once every plugin has registered", async () => {
    const shell = noted();
    const registrations: DashboardWidgetRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        "dashboard:register-widget",
        (message) => {
          registrations.push(message.payload);
          return { success: true };
        },
      );
    const loads: string[] = [];
    await install(shell, mapping(loads));
    expect(registrations).toEqual([]);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "shell",
    });

    const [registration] = registrations;
    if (!registration) throw new Error("The widget was not registered");
    expect(registration).toMatchObject({ id: "map", title: "Map" });
    expect(registration.renderer).toMatchObject({ clientStyles: ".map{}" });
    const data = await registration.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });
    expect(data).toMatchObject({ source: { count: 1 } });
    // A viewer nobody signed in reads as public.
    expect(loads).toEqual(["public"]);
  });

  it("registers no widget in a worker", async () => {
    const shell = noted();
    const registrations: unknown[] = [];
    shell.getMessageBus().subscribe("dashboard:register-widget", (message) => {
      registrations.push(message.payload);
      return { success: true };
    });
    await install(shell, mapping([]), true);
    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "shell",
    });

    expect(registrations).toEqual([]);
  });
});
