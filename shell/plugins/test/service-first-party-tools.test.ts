import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineServicePlugin,
  firstPartyTool,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type PluginPackageDefinition,
  type ServicePackageDefinition,
  type ServiceRuntime,
  type ToolResponse,
} from "../src";

/**
 * A first-party service converted from a class registers the tools its
 * class built, as written: under their names, with their visibility, side
 * effects and the success message they answer with, run with the call the
 * brain hands them, beside the tools its definition declares.
 */

const config = z.object({ greeting: z.string().default("hello") });

async function install(
  definition: PluginPackageDefinition,
): Promise<
  ReturnType<ReturnType<typeof createPluginHarness>["getCapabilities"]>
> {
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  const harness = createPluginHarness({ logger: createSilentLogger() });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness.getCapabilities();
}

describe("withTools on a service", () => {
  it("registers its class's tools as written, beside the declared ones", async () => {
    let reached: ServiceRuntime | undefined;
    const seen: unknown[] = [];
    const service = withTools<typeof config, { greeting: string }>(
      defineServicePlugin(
        {
          id: "probe",
          config,
          setup: ({ config: parsed }) => ({ greeting: parsed.greeting }),
        },
        {
          tools: () => [
            firstPartyTool({
              name: "declared",
              description: "Declared.",
              input: z.object({}),
              output: z.object({}),
              execute: () => ({}),
            }),
          ],
        },
      ),
      (context) => {
        reached = serviceRuntime(context);
        return [
          {
            name: "probe_greet",
            description: "Greet someone.",
            inputSchema: { name: z.string() },
            visibility: "public",
            sideEffects: "external",
            handler: async (input, toolContext): Promise<ToolResponse> => {
              seen.push({
                input,
                interfaceType: toolContext.interfaceType,
                call: reached?.toolCall(),
              });
              return {
                success: true,
                message: `${context.state.greeting}, ${String(Reflect.get(Object(input), "name"))}`,
                data: { config: context.config.greeting },
              };
            },
          },
        ];
      },
    );

    const { tools } = await install(service);
    expect(
      tools.map(({ name, visibility, sideEffects }) => ({
        name,
        visibility,
        sideEffects,
      })),
    ).toEqual([
      { name: "probe_declared", visibility: "admin", sideEffects: "none" },
      { name: "probe_greet", visibility: "public", sideEffects: "external" },
    ]);

    const greet = tools.find(({ name }) => name === "probe_greet");
    expect(
      await greet?.handler(
        { name: "Ada" },
        {
          interfaceType: "cli",
          actor: { kind: "user", userId: "operator" },
          conversationId: "conversation-1",
          userPermissionLevel: "admin",
        },
      ),
    ).toEqual({
      success: true,
      message: "hello, Ada",
      data: { config: "hello" },
    });
    expect(seen).toEqual([
      {
        input: { name: "Ada" },
        interfaceType: "cli",
        call: {
          conversationId: "conversation-1",
          userPermissionLevel: "admin",
        },
      },
    ]);
  });

  it("refuses a tool name the definition already declares", async () => {
    const service = withTools(
      defineServicePlugin(
        { id: "probe", config },
        {
          tools: () => [
            firstPartyTool(
              {
                name: "probe_twice",
                description: "Declared.",
                input: z.object({}),
                output: z.object({}),
                execute: () => ({}),
              },
              { bareName: true },
            ),
          ],
        },
      ),
      () => [
        {
          name: "probe_twice",
          description: "As written.",
          inputSchema: {},
          handler: async (): Promise<ToolResponse> => ({ success: true }),
        },
      ],
    );
    expect(install(service)).rejects.toThrow(
      'Service "probe" defines tool "probe_twice" more than once',
    );
  });

  it("is declared once, on a definition defineServicePlugin returned", () => {
    const service = withTools(
      defineServicePlugin({ id: "probe", config }),
      () => [],
    );
    expect(() => withTools(service, () => [])).toThrow(
      'Service "probe" declares its tools more than once',
    );
    const forged: ServicePackageDefinition<typeof config> = {
      ...defineServicePlugin({ id: "probe", config }),
    };
    expect(() => withTools(forged, () => [])).toThrow(
      'withTools takes a definition defineServicePlugin returned; "probe" is not one',
    );
    // An interface keeps its own declarations.
    expect(() =>
      withTools(defineInterface({ id: "probe", config }), () => []),
    ).not.toThrow();
  });
});
