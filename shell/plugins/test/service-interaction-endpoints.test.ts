import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  endpointInfoSchema,
  interactionInfoSchema,
  type EndpointInfo,
  type InteractionInfo,
  type ServiceInteractionDeclaration,
} from "../src";
import { z } from "@brains/utils/zod";
import { PluginManager } from "../src/manager/pluginManager";
import { createMockShell } from "../src/test/mock-shell";

function fixture(
  options: {
    failEndpoint?: boolean;
    failReady?: boolean;
    executionOnly?: boolean;
  } = {},
): {
  shell: ReturnType<typeof createMockShell>;
  manager: PluginManager;
  endpoints: Map<string, EndpointInfo>;
  interactions: Map<string, InteractionInfo>;
  install(declarations: ServiceInteractionDeclaration[]): Promise<string>;
} {
  const logger = createSilentLogger("interaction-endpoints");
  const shell = createMockShell({ logger });
  // Model the shell's owner-indexed discovery stores, including the cleanup
  // contract called by the real manager on rollback and shutdown.
  const endpoints = new Map<string, EndpointInfo>();
  const interactions = new Map<string, InteractionInfo>();
  shell.registerEndpoint = (input): void => {
    const value = endpointInfoSchema.parse(input);
    endpoints.set(value.pluginId, value);
    if (options.failEndpoint) throw new Error("endpoint failed");
  };
  shell.registerInteraction = (input): void => {
    const value = interactionInfoSchema.parse(input);
    interactions.set(value.pluginId, value);
  };
  shell.unregisterPluginCapabilities = async (owner): Promise<void> => {
    endpoints.delete(owner);
    interactions.delete(owner);
  };
  const manager = PluginManager.createFresh(logger, shell.getDaemonRegistry());
  manager.setShell(shell);
  const install = async (
    declarations: ServiceInteractionDeclaration[],
  ): Promise<string> => {
    const definition = defineServicePlugin(
      { id: "navigation", config: z.object({}) },
      {
        interactions: () => declarations,
        ready: () => {
          if (options.failReady) throw new Error("ready failed");
        },
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      {
        name: "@fixture/navigation",
        version: "0.0.0",
      },
    );
    if (!plugin) throw new Error("Missing plugin");
    manager.registerPlugin(plugin);
    await manager.initializePlugins({
      executionOnly: options.executionOnly ?? false,
    });
    return plugin.id;
  };
  return { shell, manager, endpoints, interactions, install };
}

function declaration(): ServiceInteractionDeclaration {
  return {
    id: "chat",
    label: "Chat",
    href: "/chat",
    kind: "human",
    visibility: "trusted",
    requiresActiveSession: true,
    priority: 15,
    publishEndpoint: true,
  };
}

describe("service interaction endpoint projection", () => {
  it("publishes detached matching metadata with installed ownership and removes it at shutdown", async () => {
    const f = fixture();
    const entry = declaration();
    const owner = await f.install([entry]);
    try {
      await f.manager.readyPlugins();
      expect(f.endpoints.get(owner)).toEqual({
        pluginId: owner,
        label: "Chat",
        url: "/chat",
        priority: 15,
        visibility: "trusted",
        requiresActiveSession: true,
      });
      expect(f.interactions.get(owner)).toMatchObject({
        id: "chat",
        href: "/chat",
        visibility: "trusted",
        requiresActiveSession: true,
      });
      Reflect.set(entry, "label", "Changed");
      expect(f.endpoints.get(owner)?.label).toBe("Chat");
      expect(f.interactions.get(owner)?.label).toBe("Chat");
      // Discovery does not register a route or grant access to one.
      expect(f.shell.getPluginWebRoutes()).toEqual([]);
    } finally {
      await f.manager.shutdownPlugins();
    }
    expect(f.endpoints.size).toBe(0);
    expect(f.interactions.size).toBe(0);
  });

  it("preserves native discovery defaults for an opted-in interaction", async () => {
    const f = fixture();
    const owner = await f.install([
      {
        id: "chat",
        label: "Chat",
        href: "/chat",
        kind: "human",
        publishEndpoint: true,
      },
    ]);
    try {
      await f.manager.readyPlugins();
      expect(f.endpoints.get(owner)).toEqual({
        pluginId: owner,
        label: "Chat",
        url: "/chat",
        priority: 100,
        visibility: "public",
      });
      expect(f.interactions.get(owner)).toMatchObject({
        priority: 100,
        visibility: "public",
        status: "available",
      });
    } finally {
      await f.manager.shutdownPlugins();
    }
  });

  it("publishes neither projection in an execution-only worker", async () => {
    const f = fixture({ executionOnly: true });
    await f.install([declaration()]);
    try {
      await f.manager.readyPlugins();
      expect(f.endpoints.size).toBe(0);
      expect(f.interactions.size).toBe(0);
    } finally {
      await f.manager.shutdownPlugins();
    }
  });

  for (const publishEndpoint of [undefined, false]) {
    it(`leaves endpoint publication off for ${publishEndpoint}`, async () => {
      const f = fixture();
      const owner = await f.install([{ ...declaration(), publishEndpoint }]);
      try {
        await f.manager.readyPlugins();
        expect(f.interactions.has(owner)).toBe(true);
        expect(f.endpoints.size).toBe(0);
      } finally {
        await f.manager.shutdownPlugins();
      }
    });
  }

  for (const field of ["publishEndpoint", "pluginId"]) {
    it(`rejects invalid ${field} before publishing the batch`, async () => {
      const f = fixture();
      const invalid = declaration();
      Reflect.set(invalid, field, "forged");
      await f.install([declaration(), invalid]);
      try {
        const [ready] = await Promise.allSettled([f.manager.readyPlugins()]);
        expect(ready).toMatchObject({
          status: "rejected",
          reason: expect.any(Error),
        });
        expect(f.interactions.size).toBe(0);
        expect(f.endpoints.size).toBe(0);
      } finally {
        await f.manager.shutdownPlugins();
      }
    });
  }

  for (const failure of ["endpoint", "ready"]) {
    it(`rolls back both projections after ${failure} failure without removing another owner`, async () => {
      const f = fixture({
        failEndpoint: failure === "endpoint",
        failReady: failure === "ready",
      });
      const other = endpointInfoSchema.parse({
        pluginId: "other",
        label: "Other",
        url: "/other",
      });
      f.endpoints.set("other", other);
      const otherInteraction = interactionInfoSchema.parse({
        pluginId: "other",
        id: "other",
        label: "Other",
        href: "/other",
        kind: "human",
      });
      f.interactions.set("other", otherInteraction);
      const owner = await f.install([declaration()]);
      try {
        const [ready] = await Promise.allSettled([f.manager.readyPlugins()]);
        expect(ready).toMatchObject({
          status: "rejected",
          reason: expect.objectContaining({
            message: expect.stringContaining(`${failure} failed`),
          }),
        });
        expect(f.endpoints.has(owner)).toBe(false);
        expect(f.interactions.has(owner)).toBe(false);
        expect(f.endpoints.get("other")).toEqual(other);
        expect(f.interactions.get("other")).toEqual(otherInteraction);
      } finally {
        await f.manager.shutdownPlugins();
      }
    });
  }
});
