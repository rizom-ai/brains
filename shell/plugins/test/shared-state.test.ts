import { describe, expect, it } from "bun:test";
import type { DataSource } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  defineInterface,
  defineServicePlugin,
  defineSharedState,
  defineTool,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type SharedState,
} from "../src";
import { sharedStateNamespace } from "../src/public/shared-state";

type Harness = ReturnType<typeof createPluginHarness>;
type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): readonly Plugin[] {
  return instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name,
      version: "0.1.0",
    },
  );
}

async function install(
  harness: Harness,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): Promise<void> {
  for (const plugin of instantiate(definition, name)) {
    await harness.installPlugin(plugin);
  }
}

const caller = {
  interfaceType: "test",
  actor: { kind: "service", serviceId: "test" },
  userPermissionLevel: "admin",
} as const;

const tally = z.object({ count: z.number(), label: z.string().default("") });
const digestTally = defineSharedState("@fixture/digests:tally", tally);
const noConfig = z.object({});

/** A service that owns the digest tally and counts into it. */
function tallyService(
  state: SharedState<z.output<typeof tally>, z.input<typeof tally>>,
): Parameters<typeof instantiatePluginPackageDefinition>[0] {
  return defineServicePlugin(
    {
      id: "digests",
      config: noConfig,
      setup: ({ runtimeState }) => ({ tally: runtimeState(state) }),
    },
    {
      tools: ({ state: { tally: store } }) => [
        defineTool({
          name: "count",
          description: "Count one digest",
          input: z.object({}),
          output: z.object({ count: z.number() }),
          async execute() {
            const count = ((await store.get("total"))?.count ?? 0) + 1;
            await store.set("total", { count });
            return { count };
          },
        }),
      ],
    },
  );
}

const shelfNote = defineEntity({
  type: "shelf-note",
  purpose: "A note on the shelf.",
  metadata: z.object({ title: z.string() }),
});

/** A package whose data source reads the digest tally. */
const shelfReader = defineEntityPackage({
  id: "shelf",
  entities: [shelfNote],
  dataSources: [
    defineDataSource({
      id: "tally",
      name: "Tally",
      description: "How many digests the digest service counted",
      fetch: async (_query, _entities, context) => {
        const reader = context.sharedState(digestTally);
        return {
          total: (await reader.get("total")) ?? null,
          missing: await reader.get("absent"),
          members: Object.keys(reader),
        };
      },
    }),
  ],
});

function registered(harness: Harness, id: string): DataSource {
  const dataSource = harness.getDataSources().get(id);
  if (!dataSource?.fetch) throw new Error(`Data source ${id} is missing`);
  return dataSource;
}

/** The message a promise is refused with. */
async function refusal(promise: Promise<unknown> | undefined): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected a refusal");
}

describe("defineSharedState", () => {
  it("names a record by the package that owns it", () => {
    expect(digestTally).toEqual({
      kind: "rizom-shared-state",
      name: "@fixture/digests:tally",
      schema: tally,
    });
    expect(Object.isFrozen(digestTally)).toBe(true);
  });

  it("refuses a name that is not <package name>:<name>", () => {
    const names: `${string}:${string}`[] = [
      "@fixture/digests:",
      ":tally",
      "a:b:c",
    ];
    for (const name of names) {
      expect(() => defineSharedState(name, tally)).toThrow(
        "<package name>:<name>",
      );
    }
    // @ts-expect-error The types refuse a name without its package, too.
    expect(() => defineSharedState("tally", tally)).toThrow(
      "<package name>:<name>",
    );
    expect(() => defineSharedState("@fixture/x:has space", tally)).toThrow(
      "<package name>:<name>",
    );
  });
});

describe("shared runtime state", () => {
  it("is written by its owner and read by another package's data source", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      const [service] = instantiate(
        tallyService(digestTally),
        "@fixture/digests",
      );
      if (!service) throw new Error("No service");
      const capabilities = await harness.installPlugin(service);
      await capabilities.tools[0]?.handler({}, caller);
      await capabilities.tools[0]?.handler({}, caller);
      await install(harness, shelfReader, "@fixture/shelf");

      expect(
        await registered(harness, "@fixture/shelf:tally").fetch?.(
          {},
          z.object({
            total: z
              .object({ count: z.number(), label: z.string() })
              .nullable(),
            missing: z.null(),
            members: z.array(z.string()),
          }),
          { entityService: harness.getEntityService() },
        ),
      ).toEqual({
        total: { count: 2, label: "" },
        missing: null,
        // A reader only reads.
        members: ["get"],
      });

      // Stored apart from every package's private namespaces.
      expect(
        await harness
          .getMockShell()
          .getRuntimeState()
          .scoped({
            namespace: sharedStateNamespace("@fixture/digests:tally"),
            schema: tally,
          })
          .get("total"),
      ).toEqual({ count: 2, label: "" });
    } finally {
      await harness.reset();
    }
  });

  it("refuses a service that writes another package's shared state", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      const [service] = instantiate(
        tallyService(digestTally),
        "@fixture/impostor",
      );
      if (!service) throw new Error("No service");
      expect(await refusal(harness.installPlugin(service))).toContain(
        'Package "@fixture/impostor" writes only shared state named "@fixture/impostor:<name>", and "@fixture/digests:tally" is not one',
      );
    } finally {
      await harness.reset();
    }
  });

  it("is read by a first-party service's data source through its declaration, and only so", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    try {
      const [service] = instantiate(
        tallyService(digestTally),
        "@fixture/digests",
      );
      if (!service) throw new Error("No service");
      const capabilities = await harness.installPlugin(service);
      await capabilities.tools[0]?.handler({}, caller);
      const reader = defineServicePlugin({
        id: "ledger",
        config: noConfig,
        setup: (context) => {
          const runtime = serviceRuntime(context);
          runtime.dataSource({
            id: "tally",
            name: "Tally",
            description: "How many digests the digest service counted",
            fetch: async (_query, { sharedState }) => {
              const store = sharedState(digestTally);
              return {
                total: await store.get("total"),
                members: Object.keys(store),
              };
            },
          });
          runtime.dataSource({
            id: "raw",
            name: "Raw",
            description: "Reads a record by its storage namespace",
            fetch: async (_query, { sharedState }) =>
              sharedState({
                // @ts-expect-error A storage namespace is no declaration.
                namespace: sharedStateNamespace("@fixture/digests:tally"),
                schema: tally,
              }).get("total"),
          });
          return {};
        },
      });
      await install(harness, reader, "@fixture/ledger");

      expect(
        await registered(harness, "@fixture/ledger:ledger:tally").fetch?.(
          {},
          z.object({
            total: z.object({ count: z.number(), label: z.string() }),
            members: z.array(z.string()),
          }),
          { entityService: harness.getEntityService() },
        ),
      ).toEqual({ total: { count: 1, label: "" }, members: ["get"] });
      expect(
        await refusal(
          registered(harness, "@fixture/ledger:ledger:raw").fetch?.(
            {},
            z.unknown(),
            {
              entityService: harness.getEntityService(),
            },
          ),
        ),
      ).toContain(
        "A data source reads only shared state declared with defineSharedState",
      );
    } finally {
      await harness.reset();
    }
  });

  it("lets an interface write the shared state it owns, and only that", async () => {
    const webhook = defineInterface({
      id: "webhook",
      config: noConfig,
      setup: async ({ runtimeState }) => {
        await runtimeState(digestTally).set("total", { count: 5 });
        return {};
      },
    });
    const owner = createPluginHarness({ logger: createSilentLogger() });
    const impostor = createPluginHarness({ logger: createSilentLogger() });
    try {
      const [owned] = instantiate(webhook, "@fixture/digests");
      if (!owned) throw new Error("No interface");
      await owner.installPlugin(owned);
      expect(
        await owner
          .getMockShell()
          .getRuntimeState()
          .scoped({
            namespace: sharedStateNamespace("@fixture/digests:tally"),
            schema: tally,
          })
          .get("total"),
      ).toEqual({ count: 5, label: "" });

      const [foreign] = instantiate(webhook, "@fixture/elsewhere");
      if (!foreign) throw new Error("No interface");
      expect(await refusal(impostor.installPlugin(foreign))).toContain(
        'writes only shared state named "@fixture/elsewhere:<name>"',
      );
    } finally {
      await owner.reset();
      await impostor.reset();
    }
  });
});
