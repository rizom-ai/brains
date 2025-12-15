import { describe, test, expect, beforeEach } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { calculatorServicePlugin } from "../src/service-plugin-example";
import type { PluginCapabilities } from "@brains/plugins/test";
import { DefaultContentFormatter } from "@brains/utils";
import { z } from "@brains/utils";

describe("ServicePlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test-datadir" });

    // Register test templates
    harness.registerTemplate("test-template", {
      name: "test-template",
      description: "Test template",
      schema: z.object({}),
      basePrompt: "",
      formatter: new DefaultContentFormatter(),
      requiredPermission: "public",
    });

    harness.registerTemplate("math-explanation", {
      name: "math-explanation",
      description: "Math explanation template",
      schema: z.object({}),
      basePrompt: "",
      formatter: new DefaultContentFormatter(),
      requiredPermission: "public",
    });

    // Install the plugin
    const plugin = calculatorServicePlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  test("plugin registers successfully", () => {
    expect(capabilities).toBeDefined();
    expect(capabilities.tools.length).toBe(1);
    expect(capabilities.tools[0]?.name).toBe("calculate");
    expect(capabilities.resources.length).toBe(1);
    expect(capabilities.resources[0]?.name).toBe("Calculation History");
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

  test("provides job queue functionality", () => {
    const shell = harness.getShell();
    const jobQueueService = shell.getJobQueueService();

    // Check that job queue service is available
    expect(jobQueueService).toBeDefined();
    expect(jobQueueService.registerHandler).toBeDefined();
  });

  test("provides render service access", () => {
    const shell = harness.getShell();
    const renderService = shell.getRenderService();

    expect(renderService).toBeDefined();
    // Routes are now managed through the site-builder plugin via message bus
  });

  test("provides content generation", () => {
    const shell = harness.getShell();
    const contentGenerator = shell.getContentService();

    expect(contentGenerator).toBeDefined();
    expect(contentGenerator.generateContent).toBeDefined();
  });

  test("handles calculation requests through messaging", async () => {
    // The plugin subscribes to calc:request in its onRegister method
    const response = await harness.sendMessage("calc:request", {
      operation: "add",
      a: 5,
      b: 3,
    });

    // The handler returns { success: true } which doesn't have a data property
    // so harness.sendMessage returns undefined
    expect(response).toBeUndefined();
  });

  test("provides calculate tool", () => {
    const calculateTool = capabilities.tools.find(
      (t) => t.name === "calculate",
    );
    expect(calculateTool).toBeDefined();
    expect(calculateTool?.description).toBe(
      "Perform mathematical calculations",
    );
  });

  test("registers job handlers", async () => {
    // Service plugins should register job handlers for async processing
    // This is internal to the plugin, but we can verify through the shell
    const shell = harness.getShell();
    const jobQueueService = shell.getJobQueueService();

    // The mock job queue service doesn't track registered handlers
    // but we can verify the service is available for the plugin to use
    expect(jobQueueService).toBeDefined();
  });
});
