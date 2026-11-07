import { describe, expect, expectTypeOf, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type ServicePackageDefinition,
} from "../src";

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name, version: "0.1.0" },
  );
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

const caller = {
  interfaceType: "test",
  actor: { kind: "service", serviceId: "test" },
  userPermissionLevel: "admin",
} as const;

const deliveries = z.object({ total: z.number() });
const noConfig = z.object({});

/** A service that counts deliveries in its own runtime state. */
function deliveryCounter(
  id: string,
): ServicePackageDefinition<typeof noConfig> {
  return defineServicePlugin(
    {
      id,
      config: noConfig,
      setup: ({ runtimeState }) => ({
        deliveries: runtimeState({
          namespace: "deliveries",
          schema: deliveries,
        }),
      }),
    },
    {
      tools: ({ state }) => [
        defineTool({
          name: "deliver",
          description: "Count one delivery",
          input: z.object({}),
          output: deliveries,
          async execute() {
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

describe("two-stage service definitions", () => {
  it("defines a service from its header alone", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const capabilities = await harness.installPlugin(
      instantiate(
        defineServicePlugin({ id: "header-only", config: z.object({}) }),
        "@fixture/header-only",
      ),
    );
    expect(capabilities.tools).toEqual([]);
  });

  it("binds every behavior slot to the state the header's setup returns", async () => {
    const definition = defineServicePlugin(
      {
        id: "greeter",
        config: z.object({ greeting: z.string().default("Hello") }),
        setup: ({ config }) => ({
          greet: (name: string): string => `${config.greeting}, ${name}`,
        }),
      },
      {
        // Written before any slot that could have fixed the state's type.
        instructions: ({ state }) => state.greet("agent"),
        tools: ({ state }) => {
          expectTypeOf(state.greet).toEqualTypeOf<(name: string) => string>();
          return [
            defineTool({
              name: "greet",
              description: "Greet someone",
              input: z.object({ name: z.string() }),
              output: z.object({ message: z.string() }),
              execute: ({ input }) => ({ message: state.greet(input.name) }),
            }),
          ];
        },
      },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const capabilities = await harness.installPlugin(
      instantiate(definition, "@fixture/greeter"),
    );
    expect(capabilities.instructions).toBe("Hello, agent");
    expect(
      await capabilities.tools[0]?.handler({ name: "Sam" }, caller),
    ).toEqual({ success: true, data: { message: "Hello, Sam" } });
  });

  it("keeps runtime state under the owning package", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const alpha = await harness.installPlugin(
      instantiate(deliveryCounter("counter"), "@fixture/alpha"),
    );
    const beta = await harness.installPlugin(
      instantiate(deliveryCounter("counter-two"), "@fixture/beta"),
    );
    await alpha.tools[0]?.handler({}, caller);
    await alpha.tools[0]?.handler({}, caller);
    expect(await beta.tools[0]?.handler({}, caller)).toEqual({
      success: true,
      data: { total: 1 },
    });

    // The local namespace is qualified by the package that declared it, so
    // two packages naming the same namespace never share a record.
    const runtimeState = harness.getMockShell().getRuntimeState();
    const stored = (namespace: string): Promise<unknown> =>
      runtimeState.scoped({ namespace, schema: deliveries }).get("count");
    expect(await stored("fixture.alpha.deliveries")).toEqual({ total: 2 });
    expect(await stored("fixture.beta.deliveries")).toEqual({ total: 1 });
    expect(await stored("deliveries")).toBeNull();
  });

  it("tags the namespace of a package name the scoped form cannot carry", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const plain = await harness.installPlugin(
      instantiate(deliveryCounter("counter"), "reading.counter"),
    );
    await plain.tools[0]?.handler({}, caller);
    const owner = Buffer.from("reading.counter").toString("base64url");
    expect(
      await harness
        .getMockShell()
        .getRuntimeState()
        .scoped({
          namespace: `package:${owner}:deliveries`,
          schema: deliveries,
        })
        .get("count"),
    ).toEqual({ total: 1 });
  });

  it("writes schema input to runtime state and reads its parsed output", async () => {
    const definition = defineServicePlugin(
      {
        id: "parsed-state",
        config: z.object({}),
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
        tools: ({ state }) => [
          defineTool({
            name: "round-trip",
            description: "Store input and read output",
            input: z.object({}),
            output: z.object({ count: z.number(), label: z.string() }),
            async execute() {
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
    const capabilities = await harness.installPlugin(
      instantiate(definition, "@fixture/parsed-state"),
    );
    expect(await capabilities.tools[0]?.handler({}, caller)).toEqual({
      success: true,
      data: { count: 7, label: "ready" },
    });
  });

  it("refuses behavior written into the header", () => {
    expect(() =>
      defineServicePlugin({
        id: "misplaced",
        config: z.object({}),
        // @ts-expect-error Behavior is the second argument, not part of the header.
        tools: () => [],
      }),
    ).toThrow('Service "misplaced" declares "tools" in its header');
  });
});
