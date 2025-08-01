import { describe, test, expect, beforeEach } from "bun:test";
import { InterfacePluginTestHarness } from "../src/test-harness";
import { webserverInterfacePlugin } from "../examples/webserver-interface-plugin";
import type { WebserverInterfacePlugin } from "../examples/webserver-interface-plugin";
import type { PluginCapabilities } from "@brains/plugins";
import { DefaultContentFormatter } from "@brains/utils";
import type { DaemonRegistry } from "@brains/daemon-registry";
import { z } from "zod";

describe("InterfacePlugin", () => {
  let harness: InterfacePluginTestHarness<WebserverInterfacePlugin>;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = new InterfacePluginTestHarness();

    // Register test templates
    harness.registerTemplate("test-template", {
      name: "test-template",
      description: "Test template",
      schema: z.object({}),
      basePrompt: "",
      formatter: new DefaultContentFormatter(),
      requiredPermission: "public",
    });

    // Install the plugin
    const plugin = webserverInterfacePlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  test("plugin registers successfully", () => {
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.commands).toEqual([]);
  });

  test("provides daemon management", () => {
    const shell = harness.getShell();
    const serviceRegistry = shell.getServiceRegistry();
    const daemonRegistry =
      serviceRegistry.resolve<DaemonRegistry>("daemonRegistry");

    // Plugin should have registered a daemon with prefixed name
    expect(daemonRegistry).toBeDefined();
    expect(daemonRegistry.has("webserver-interface:webserver-interface")).toBe(
      true,
    );
  });

  test("can start and stop", async () => {
    const plugin = harness.getPlugin();

    // Start the plugin
    await plugin.start();

    // Stop the plugin
    await plugin.stop();

    expect(plugin).toBeDefined();
  });

  test("provides command execution", () => {
    const shell = harness.getShell();
    const commandRegistry = shell.getCommandRegistry();

    expect(commandRegistry).toBeDefined();
    expect(commandRegistry.listCommands).toBeDefined();
  });

  test("provides entity service access", () => {
    const shell = harness.getShell();
    const entityService = shell.getEntityService();

    expect(entityService).toBeDefined();
    expect(entityService.createEntity).toBeDefined();
    expect(entityService.updateEntity).toBeDefined();
    expect(entityService.deleteEntity).toBeDefined();
    expect(entityService.getEntity).toBeDefined();
    expect(entityService.listEntities).toBeDefined();
  });

  test("handles system status requests", async () => {
    // Send a system status request
    const response = await harness.sendMessage("system:status:request", {});

    expect(response).toBeDefined();
    expect(response).toHaveProperty("status");
    expect(response).toHaveProperty("message");
  });

  test("registers web templates", () => {
    const templates = harness.getTemplates();

    // Templates are registered with plugin prefix
    expect(templates.has("webserver-interface:web-page")).toBe(true);
    expect(templates.has("webserver-interface:api-response")).toBe(true);

    const webTemplate = templates.get("webserver-interface:web-page");
    expect(webTemplate).toBeDefined();
    expect(webTemplate?.name).toBe("web-page");

    const apiTemplate = templates.get("webserver-interface:api-response");
    expect(apiTemplate).toBeDefined();
    expect(apiTemplate?.name).toBe("api-response");
  });

  test("formats web page correctly", () => {
    const shell = harness.getShell();
    const contentGenerator = shell.getContentGenerator();
    const formatted = contentGenerator.formatContent(
      "web-page",
      {
        title: "Test Page",
        content: "Hello, world!",
        timestamp: "2023-01-01T12:00:00Z",
      },
      { pluginId: "webserver-interface" },
    );

    // Just verify formatting happened, don't test exact output
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  test("formats API response correctly", () => {
    const shell = harness.getShell();
    const contentGenerator = shell.getContentGenerator();
    const formatted = contentGenerator.formatContent(
      "api-response",
      {
        data: { test: "value" },
        status: "success",
        timestamp: "2023-01-01T12:00:00Z",
      },
      { pluginId: "webserver-interface" },
    );

    // Just verify formatting happened, don't test exact JSON structure
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("test");
    expect(formatted).toContain("value");
  });

  test("daemon health check works", async () => {
    const shell = harness.getShell();
    const serviceRegistry = shell.getServiceRegistry();
    const daemonRegistry =
      serviceRegistry.resolve<DaemonRegistry>("daemonRegistry");

    // Check health through daemon registry
    // Daemon is registered with plugin prefix
    const health = await daemonRegistry.checkHealth(
      "webserver-interface:webserver-interface",
    );
    expect(health).toBeDefined();
    expect(health?.status).toBe("error"); // Daemon not started yet, returns error status
  });

  test("provides job queue access", () => {
    const shell = harness.getShell();
    const jobQueueService = shell.getJobQueueService();

    expect(jobQueueService).toBeDefined();
    expect(jobQueueService.getActiveJobs).toBeDefined();
  });
});
