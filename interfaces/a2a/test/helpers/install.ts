import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  a2aInterface,
  agentCallTool,
  executeAgentCall,
  type A2ACallResponse,
  type A2AClientDeps,
  type A2AInterfaceDeps,
} from "../../src";
import type { A2AConfigInput } from "../../src/config";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const A2A_PLUGIN_ID: string = `${packageJson.name}:a2a`;

/** The card as served: what the tests read of it, the rest carried along. */
const servedAgentCardSchema: z.ZodObject<
  {
    name: z.ZodString;
    url: z.ZodString;
    skills: z.ZodDefault<
      z.ZodArray<z.ZodObject<{ name: z.ZodString }, z.core.$loose>>
    >;
  },
  z.core.$loose
> = z.looseObject({
  name: z.string(),
  url: z.string(),
  skills: z.array(z.looseObject({ name: z.string() })).default([]),
});
export type ServedAgentCard = z.output<typeof servedAgentCardSchema>;
export const CALL_TOOL = "a2a_call";

/** The plugin the runtime builds from one config, with a test's fetch. */
export function instantiate(
  config: A2AConfigInput = {},
  deps: A2AInterfaceDeps = {},
): Plugin {
  const definition = a2aInterface(deps);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("A2A interface plugin was not created");
  return plugin;
}

export interface InstalledA2A {
  readonly plugin: Plugin;
  readonly capabilities: PluginCapabilities;
  routes(): WebRouteDefinition[];
  route(path: string, method: string): WebRouteDefinition;
  /** The Agent Card as the card route serves it. */
  agentCard(): Promise<ServedAgentCard>;
}

export async function installA2A(
  harness: PluginTestHarness,
  config: A2AConfigInput = {},
  deps: A2AInterfaceDeps = {},
): Promise<InstalledA2A> {
  const plugin = instantiate(config, deps);
  const capabilities = await harness.installPlugin(plugin);
  const routes = (): WebRouteDefinition[] => plugin.getWebRoutes?.() ?? [];
  const route = (path: string, method: string): WebRouteDefinition => {
    const found = routes().find(
      (candidate) => candidate.path === path && candidate.method === method,
    );
    if (!found) throw new Error(`Expected A2A route ${method} ${path}`);
    return found;
  };
  return {
    plugin,
    capabilities,
    routes,
    route,
    agentCard: async (): Promise<ServedAgentCard> => {
      const response = await route(
        "/.well-known/agent-card.json",
        "GET",
      ).handler(new Request("http://brain/.well-known/agent-card.json"));
      if (response.status !== 200) {
        throw new Error(`Agent Card route answered ${response.status}`);
      }
      return servedAgentCardSchema.parse(await response.json());
    },
  };
}

/**
 * The call tool as the old factory handed it to tests: its declared facts and
 * a handler over the same outbound path. The runtime wiring of the declared
 * tool is covered where the interface is installed.
 */
export function callTool(deps: A2AClientDeps = {}): {
  name: string;
  visibility: string | undefined;
  sideEffects: string | undefined;
  description: string;
  handler(
    input: unknown,
    context?: Record<string, unknown> & { signal?: AbortSignal | undefined },
  ): Promise<A2ACallResponse>;
} {
  const definition = agentCallTool(deps);
  return {
    name: `a2a_${definition.name}`,
    visibility: definition.permission,
    sideEffects: definition.sideEffects,
    description: definition.description,
    handler: async (input, context): Promise<A2ACallResponse> => {
      const parsed = z
        .object({ agent: z.string(), message: z.string() })
        .safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }
      return executeAgentCall(parsed.data, deps, {
        ...(context?.signal ? { signal: context.signal } : {}),
      });
    },
  };
}
