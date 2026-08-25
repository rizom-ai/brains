import { describe, it, expect } from "bun:test";
import type { Plugin } from "@brains/plugins";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { captureChecks, installAgentDiscovery } from "./fixtures/agent-network";

describe("what the package registers", () => {
  it("should not auto-create agents from a2a call completion events", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    await harness.sendMessage(
      "a2a:call:completed",
      { domain: "yeehaa.io" },
      "a2a",
    );

    const agent = await harness.getEntityService().getEntity({
      entityType: "agent",
      id: "yeehaa.io",
    });
    expect(agent).toBeNull();

    harness.reset();
  });

  it("does not register system_create URL interception for agent contacts", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    expect(
      harness.getEntityRegistry().getCreateInterceptor("agent"),
    ).toBeUndefined();

    harness.reset();
  });

  it("registers the directory scan as a daily recurring check", async () => {
    const harness = createPluginHarness<Plugin>({});
    // Two checks register — the agent type refreshes cards, the service
    // scans directories — so this picks the one it is about.
    const checks = captureChecks(harness);
    await installAgentDiscovery(harness);

    expect(
      checks.find(({ id }) => id.endsWith("directory-scan")),
    ).toMatchObject({ cadence: "daily" });
    harness.reset();
  });

  it("registers agent directory and proximity-map datasources", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    expect(Array.from(harness.getDataSources().keys()).sort()).toEqual([
      "@brains/agent-discovery:entities",
      "@brains/agent-discovery:proximity-map",
    ]);

    harness.reset();
  });

  it("registers site templates under the scoped names routes reference", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    // Site routes address templates by their scoped name — these are the
    // public contract, and sites/rizom-ai references them verbatim.
    const names = Array.from(harness.getTemplates().keys()).sort();
    expect(names).toEqual([
      "@brains/agent-discovery:agent:agent-detail",
      "@brains/agent-discovery:agent:agent-list",
      "@brains/agent-discovery:agent:proximity-map",
      "@brains/agent-discovery:skill:skill-derivation",
    ]);

    harness.reset();
  });

  it("should register dashboard widgets on plugins-registered", async () => {
    const harness = createPluginHarness<Plugin>({});
    const registrations: Array<{
      id: string;
      group: string;
      rendererName: string;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as {
        id: string;
        group: string;
        rendererName: string;
      };
      registrations.push({
        id: payload.id,
        group: payload.group,
        rendererName: payload.rendererName,
      });
      return { success: true };
    });

    await installAgentDiscovery(harness);
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {}, "shell");

    expect(registrations).toEqual([
      {
        id: "agent-network",
        group: "network",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      },
      {
        id: "agent-proximity",
        group: "network",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      },
    ]);

    harness.reset();
  });
});
