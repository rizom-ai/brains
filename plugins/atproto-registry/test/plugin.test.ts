import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { Plugin, Tool, WebRouteDefinition } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  listCanonicalAtprotoLexiconMetadata,
  listCanonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import atprotoRegistryPackage from "../src";
import { atprotoRegistryPlugin } from "./registry-plugin";

async function installed(plugin: Plugin = atprotoRegistryPlugin()): Promise<{
  routes: WebRouteDefinition[];
  tools: Tool[];
}> {
  const harness = createPluginHarness();
  const capabilities = await harness.installPlugin(plugin);
  return {
    routes: plugin.getWebRoutes?.() ?? [],
    tools: capabilities.tools,
  };
}

async function jsonFromRoute(route: WebRouteDefinition): Promise<unknown> {
  const response = await route.handler(
    new Request(`https://rizom.ai${route.path}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(
    "application/json; charset=utf-8",
  );
  return response.json();
}

async function callTool(
  tools: Tool[],
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool.handler(input, {
    interfaceType: "test",
    actor: { kind: "user", userId: "test" },
  });
}

describe("atproto registry plugin", () => {
  it("default-exports its service package definition", () => {
    expect(atprotoRegistryPackage).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "atproto-registry",
    });
  });

  it("registers under the plugin id and tool names its class had", async () => {
    const plugin = atprotoRegistryPlugin();
    const { routes, tools } = await installed(plugin);

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "atproto-registry",
      "service",
      "@brains/atproto-registry",
    ]);
    expect(
      tools.map(({ name, visibility, inputSchema }) => [
        name,
        visibility,
        Object.keys(inputSchema),
      ]),
    ).toEqual([
      ["atproto-registry_list_lexicons", "admin", []],
      ["atproto-registry_validate_lexicon", "admin", ["nsid", "record"]],
      ["atproto-registry_check_contracts", "admin", []],
    ]);
    // Every tool reads; none writes.
    expect(tools.map(({ sideEffects }) => sideEffects)).toEqual([
      "none",
      "none",
      "none",
    ]);
    expect(routes).toHaveLength(listCanonicalAtprotoLexicons().length + 1);
  });

  it("serves an index for every canonical Rizom ATProto lexicon", async () => {
    const { routes } = await installed();
    const indexRoute = routes.find(
      (route) => route.path === "/atproto/lexicons/index.json",
    );

    expect(indexRoute).toBeDefined();
    if (!indexRoute) throw new Error("Missing registry index route");
    expect(indexRoute.public).toBe(true);
    expect(indexRoute.method).toBe("GET");
    const indexBodySchema = z.object({
      lexicons: z.array(
        z.object({
          id: z.string(),
          path: z.string(),
          status: z.string(),
          version: z.string(),
          revision: z.number(),
          owner: z.string(),
          steward: z.string(),
          projectionPackage: z.string(),
          compatibility: z.string(),
        }),
      ),
    });
    const body = indexBodySchema.parse(await jsonFromRoute(indexRoute));

    expect(body.lexicons.map((lexicon) => lexicon.id).sort()).toEqual(
      listCanonicalAtprotoLexicons()
        .map((lexicon) => lexicon.id)
        .sort(),
    );
    expect(body.lexicons).toEqual(
      listCanonicalAtprotoLexiconMetadata().map((metadata) => ({
        ...metadata,
        path: `/atproto/lexicons/${metadata.id}.json`,
      })),
    );
  });

  it("serves canonical lexicon JSON by NSID", async () => {
    const { routes } = await installed();

    for (const lexicon of listCanonicalAtprotoLexicons()) {
      const route = routes.find(
        (candidate) =>
          candidate.path === `/atproto/lexicons/${lexicon.id}.json`,
      );
      expect(route).toBeDefined();
      if (!route) throw new Error(`Missing lexicon route: ${lexicon.id}`);
      expect(route.public).toBe(true);
      expect(await jsonFromRoute(route)).toEqual(lexicon);
    }
  });

  it("does not expose unknown NSID routes", async () => {
    const { routes } = await installed();

    expect(
      routes.some(
        (route) =>
          route.path === "/atproto/lexicons/ai.rizom.brain.unknown.json",
      ),
    ).toBe(false);
  });

  it("serves no routes when disabled, and keeps its tools", async () => {
    const { routes, tools } = await installed(
      atprotoRegistryPlugin({ enabled: false }),
    );

    expect(routes).toEqual([]);
    expect(tools).toHaveLength(3);
  });

  it("lists the registry index from the list tool", async () => {
    const { tools } = await installed();

    expect(await callTool(tools, "atproto-registry_list_lexicons", {})).toEqual(
      {
        success: true,
        data: {
          lexicons: listCanonicalAtprotoLexiconMetadata().map((metadata) => ({
            ...metadata,
            path: `/atproto/lexicons/${metadata.id}.json`,
          })),
        },
      },
    );
  });

  it("validates a record against a canonical lexicon", async () => {
    const { tools } = await installed();

    expect(
      await callTool(tools, "atproto-registry_validate_lexicon", {
        nsid: "ai.rizom.brain.topic",
        record: { title: 42 },
      }),
    ).toMatchObject({ success: true, data: { valid: false } });
  });

  it("refuses an unknown lexicon as not found, naming it", async () => {
    const { tools } = await installed();

    expect(
      await callTool(tools, "atproto-registry_validate_lexicon", {
        nsid: "ai.rizom.brain.unknown",
        record: {},
      }),
    ).toEqual({
      success: false,
      code: "not_found",
      error: "Unknown AT Protocol lexicon: ai.rizom.brain.unknown",
    });
  });

  it("reports canonical metadata from the contract check tool", async () => {
    const { tools } = await installed();

    const response = await callTool(
      tools,
      "atproto-registry_check_contracts",
      {},
    );
    expect(response).toEqual({
      success: true,
      data: {
        lexiconCount: listCanonicalAtprotoLexicons().length,
        nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
        metadata: listCanonicalAtprotoLexiconMetadata(),
      },
    });
  });
});
