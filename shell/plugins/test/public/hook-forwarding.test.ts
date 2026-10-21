import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../../src/test/harness";
import { ServicePlugin as RuntimeServicePlugin } from "../../src/service/service-plugin";
import { InterfacePlugin as RuntimeInterfacePlugin } from "../../src/interface/interface-plugin";
import { createTool } from "../../src/public/types";
import type {
  InterfacePluginContext,
  Resource,
  ServicePluginContext,
  Tool,
} from "../../src/public/types";
import type { WebRouteDefinition } from "../../src/types/web-routes";
import {
  forwardCommonHooks,
  forwardInterfaceHooks,
  type CommonPluginHooks,
  type InterfacePluginHooks,
} from "../../src/public/public-plugin";

const emptyConfig = z.object({});
type EmptyConfig = Record<string, never>;

const resource: Resource = {
  uri: "forwarding://resource",
  name: "forwarding resource",
  handler: async () => ({ contents: [] }),
};

const routes: WebRouteDefinition[] = [
  { path: "/forwarded", handler: async () => new Response("ok") },
];

function recordingHooks<TContext>(
  pluginId: string,
  calls: string[],
): CommonPluginHooks<TContext> {
  return {
    onRegister: async (): Promise<void> => {
      calls.push("hook:register");
    },
    onReady: async (): Promise<void> => {
      calls.push("hook:ready");
    },
    onShutdown: async (): Promise<void> => {
      calls.push("hook:shutdown");
    },
    getTools: async (): Promise<Tool[]> => [
      createTool(pluginId, "ping", "Ping", z.object({}), async () => ({
        success: true,
        data: "pong",
      })),
    ],
    getResources: async (): Promise<Resource[]> => [resource],
    getInstructions: async (): Promise<string> => "hook instructions",
  };
}

/** A runtime base whose own lifecycle the forwarding must keep running. */
class RecordingRuntimeService extends RuntimeServicePlugin<
  EmptyConfig,
  EmptyConfig
> {
  protected readonly calls: string[];

  constructor(calls: string[]) {
    super(
      "forwarding-service",
      { name: "forwarding-service", version: "1.0.0" },
      {},
      emptyConfig,
    );
    this.calls = calls;
  }

  protected override async onRegister(): Promise<void> {
    this.calls.push("runtime:register");
  }

  protected override async onReady(): Promise<void> {
    this.calls.push("runtime:ready");
  }

  protected override async onShutdown(): Promise<void> {
    this.calls.push("runtime:shutdown");
  }
}

class ForwardingService extends forwardCommonHooks(RecordingRuntimeService) {
  protected readonly hooks: CommonPluginHooks<ServicePluginContext>;

  constructor(calls: string[]) {
    super(calls);
    this.hooks = recordingHooks(this.id, calls);
  }
}

class RecordingRuntimeInterface extends RuntimeInterfacePlugin<
  EmptyConfig,
  EmptyConfig
> {
  protected readonly calls: string[];

  constructor(calls: string[]) {
    super(
      "forwarding-interface",
      { name: "forwarding-interface", version: "1.0.0" },
      {},
      emptyConfig,
    );
    this.calls = calls;
  }

  protected override async onRegister(): Promise<void> {
    this.calls.push("runtime:register");
  }

  protected override async onShutdown(): Promise<void> {
    this.calls.push("runtime:shutdown");
  }
}

class ForwardingInterface extends forwardInterfaceHooks(
  RecordingRuntimeInterface,
) {
  protected readonly hooks: InterfacePluginHooks<InterfacePluginContext>;

  constructor(calls: string[]) {
    super(calls);
    this.hooks = {
      ...recordingHooks<InterfacePluginContext>(this.id, calls),
      getWebRoutes: (): WebRouteDefinition[] => routes,
      requiresDaemonStartup: (): boolean => true,
    };
  }
}

describe("runtime hook forwarding", () => {
  it("wraps the plugin's lifecycle hooks in the runtime base's own lifecycle", async () => {
    const calls: string[] = [];
    const plugin = new ForwardingService(calls);
    const harness = createPluginHarness<ForwardingService>();

    await harness.installPlugin(plugin);
    await plugin.ready();
    await plugin.shutdown();

    // Registration and readiness build on the runtime; shutdown unwinds in
    // reverse, so the plugin releases its state before the runtime does.
    expect(calls).toEqual([
      "runtime:register",
      "hook:register",
      "runtime:ready",
      "hook:ready",
      "hook:shutdown",
      "runtime:shutdown",
    ]);
  });

  it("answers capabilities from the plugin's hooks", async () => {
    const plugin = new ForwardingService([]);
    const harness = createPluginHarness<ForwardingService>();

    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools.map(({ name }) => name)).toEqual([
      "forwarding-service_ping",
    ]);
    expect(capabilities.resources).toEqual([resource]);
    expect(capabilities.instructions).toBe("hook instructions");
  });

  it("forwards an interface's lifecycle, web routes and daemon requirement", async () => {
    const calls: string[] = [];
    const plugin = new ForwardingInterface(calls);
    const harness = createPluginHarness<ForwardingInterface>();

    const capabilities = await harness.installPlugin(plugin);
    await plugin.shutdown();

    expect(calls).toEqual([
      "runtime:register",
      "hook:register",
      "hook:shutdown",
      "runtime:shutdown",
    ]);
    expect(capabilities.instructions).toBe("hook instructions");
    expect(plugin.getWebRoutes()).toBe(routes);
    expect(plugin.requiresDaemonStartup()).toBe(true);
  });
});
