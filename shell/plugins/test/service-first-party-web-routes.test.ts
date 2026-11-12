import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withWebRoutes,
  type PluginPackageDefinition,
  type ServicePackageDefinition,
  type WebRouteDefinition,
} from "../src";

/**
 * A first-party service converted from a class serves the HTTP routes its
 * class served, as written, from its config and the state setup returned:
 * any response, with the class's public and method settings, in every
 * process, as its class served them. Atproto serves the brain's did:web
 * documents this way.
 */

const config = z.object({ enabled: z.boolean().default(true) });

function didDocument(path: string): WebRouteDefinition {
  return {
    path,
    method: "GET",
    public: true,
    handler: (): Response => Response.json({ id: `did:web:${path}` }),
  };
}

async function routesOf(
  definition: PluginPackageDefinition,
  input: unknown = {},
  options: { executionOnly?: boolean } = {},
): Promise<WebRouteDefinition[]> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    input,
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin was created");
  await plugin.register(
    createMockShell(),
    options.executionOnly ? { executionOnly: true } : undefined,
  );
  return plugin.getWebRoutes?.() ?? [];
}

interface DidState {
  readonly paths: readonly string[];
}

describe("withWebRoutes on a service", () => {
  const service = withWebRoutes<typeof config, DidState>(
    defineServicePlugin({
      id: "probe",
      config,
      setup: (): DidState => ({
        paths: ["/.well-known/did.json", "/anchor/did.json"],
      }),
    }),
    ({ config: parsed, state }) =>
      parsed.enabled ? state.paths.map(didDocument) : [],
  );

  it("serves the routes its class served, as written, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const routes = await routesOf(service, {}, { executionOnly });
      expect(
        routes.map(({ path, method, public: open }) => [path, method, open]),
      ).toEqual([
        ["/.well-known/did.json", "GET", true],
        ["/anchor/did.json", "GET", true],
      ]);
      const response = await routes[0]?.handler(
        new Request("https://brain.example/.well-known/did.json"),
      );
      expect(await response?.json()).toEqual({
        id: "did:web:/.well-known/did.json",
      });
    }
  });

  it("serves none when its config says none", async () => {
    expect(await routesOf(service, { enabled: false })).toEqual([]);
  });

  it("is declared once, on a definition defineServicePlugin returned", () => {
    expect(() => withWebRoutes(service, () => [])).toThrow(
      'Service "probe" declares its web routes more than once',
    );
    const forged: ServicePackageDefinition<typeof config> = {
      ...defineServicePlugin({ id: "probe", config }),
    };
    expect(() => withWebRoutes(forged, () => [])).toThrow(
      'withWebRoutes takes a definition defineServicePlugin returned; "probe" is not one',
    );
  });
});
