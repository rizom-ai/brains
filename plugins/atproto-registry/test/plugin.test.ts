import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  listCanonicalAtprotoLexiconMetadata,
  listCanonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import { atprotoRegistryPlugin, plugin } from "../src";

async function jsonFromRoute(
  route: NonNullable<
    ReturnType<ReturnType<typeof atprotoRegistryPlugin>["getWebRoutes"]>[number]
  >,
): Promise<unknown> {
  const response = await route.handler(
    new Request(`https://rizom.ai${route.path}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  return response.json();
}

describe("atproto registry plugin", () => {
  it("exports a conventional external plugin factory", () => {
    expect(plugin).toBe(atprotoRegistryPlugin);
  });

  it("serves an index for every canonical Rizom ATProto lexicon", async () => {
    const registry = atprotoRegistryPlugin();
    const indexRoute = registry
      .getWebRoutes()
      .find((route) => route.path === "/atproto/lexicons/index.json");

    expect(indexRoute).toBeDefined();
    if (!indexRoute) throw new Error("Missing registry index route");
    expect(indexRoute.public).toBe(true);
    const body = (await jsonFromRoute(indexRoute)) as {
      lexicons: Array<{
        id: string;
        path: string;
        status: string;
        version: string;
        revision: number;
        owner: string;
        steward: string;
        projectionPackage: string;
        compatibility: string;
      }>;
    };

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
    const registry = atprotoRegistryPlugin();
    const routes = registry.getWebRoutes();

    for (const lexicon of listCanonicalAtprotoLexicons()) {
      const route = routes.find(
        (candidate) =>
          candidate.path === `/atproto/lexicons/${lexicon.id}.json`,
      );
      expect(route).toBeDefined();
      if (!route) throw new Error(`Missing lexicon route: ${lexicon.id}`);
      expect(await jsonFromRoute(route)).toEqual(lexicon);
    }
  });

  it("does not expose unknown NSID routes", () => {
    const registry = atprotoRegistryPlugin();

    expect(
      registry
        .getWebRoutes()
        .some(
          (route) =>
            route.path === "/atproto/lexicons/ai.rizom.brain.unknown.json",
        ),
    ).toBe(false);
  });

  it("reports canonical metadata from the contract check tool", async () => {
    const harness = createPluginHarness();
    const registry = atprotoRegistryPlugin();
    await harness.installPlugin(registry);

    const tool = harness
      .getCapabilities()
      .tools.find(
        (candidate) => candidate.name === "atproto-registry_check_contracts",
      );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("Missing check contracts tool");

    const response = await tool.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );
    expect("success" in response && response.success).toBe(true);
    if (!("success" in response) || !response.success) {
      throw new Error("Contract check tool failed");
    }
    expect(response.data).toEqual({
      lexiconCount: listCanonicalAtprotoLexicons().length,
      nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
      metadata: listCanonicalAtprotoLexiconMetadata(),
    });
  });
});
