import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
} from "../src";

/**
 * A first-party service reaches its internal runtime from its setup, where
 * its class's registration built what it serves, and from every slot that
 * builds what it serves: its jobs, routes, tools, Dashboard widgets and
 * Studio workspaces, as from its subscriptions. A context the runtime did not
 * build still has none.
 */

const metadata = { name: "@brains/probe", version: "0.1.0" };

/** A shell with a Studio and a Dashboard host, so the operator slots run. */
function hosted(): MockShell {
  const shell = createMockShell();
  shell.getMessageBus().subscribe("studio:register-workspace", () => ({
    success: true,
    data: { workspaceUrl: "/studio/workspaces/x" },
  }));
  shell
    .getMessageBus()
    .subscribe("dashboard:register-widget", () => ({ success: true }));
  return shell;
}

function reaching(
  reached: string[],
): Parameters<typeof instantiatePluginPackageDefinition>[0] {
  const reach = (slot: string, context: object): void => {
    serviceRuntime(context);
    reached.push(slot);
  };
  return defineServicePlugin(
    {
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        reach("setup", context);
        return {};
      },
    },
    {
      jobs: (context) => {
        reach("jobs", context);
        return [];
      },
      routes: (context) => {
        reach("routes", context);
        return [];
      },
      subscriptions: (context) => {
        reach("subscriptions", context);
        return [];
      },
      tools: (context) => {
        reach("tools", context);
        return [];
      },
      dashboardWidgets: (context) => {
        reach("dashboardWidgets", context);
        return [];
      },
      studioWorkspaces: (context) => {
        reach("studioWorkspaces", context);
        return [];
      },
    },
  );
}

describe("a first-party service's runtime, from its slots", () => {
  it("is reached from its setup and every slot that builds what it serves", async () => {
    const shell = hosted();
    const reached: string[] = [];
    const [plugin] = instantiatePluginPackageDefinition(
      reaching(reached),
      {},
      metadata,
      { pluginId: "probe" },
    );
    if (!plugin) throw new Error("No plugin");
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    expect(reached.sort()).toEqual([
      "dashboardWidgets",
      "jobs",
      "routes",
      "setup",
      "studioWorkspaces",
      "subscriptions",
      "tools",
    ]);
  });

  it("is refused on a context the runtime did not build", () => {
    expect(() => serviceRuntime({ config: {}, state: {} })).toThrow(
      "This context carries no service runtime",
    );
  });
});
