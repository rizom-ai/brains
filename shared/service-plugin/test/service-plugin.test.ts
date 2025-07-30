import { describe, test, expect, beforeEach } from "bun:test";
import { ServicePluginTestHarness } from "../src/test-harness";
import { calculatorServicePlugin } from "../examples/calculator-service-plugin";
import type { PluginCapabilities } from "@brains/plugin-base";
import { DefaultContentFormatter } from "@brains/utils";
import { z } from "zod";

describe("ServicePlugin", () => {
  let harness: ServicePluginTestHarness;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = new ServicePluginTestHarness();

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
    expect(capabilities.commands.length).toBeGreaterThan(0);
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

  test("provides batch job functionality", async () => {
    // Find the batch command
    const batchCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:batch",
    );
    expect(batchCommand).toBeDefined();

    // Test batch enqueueing
    expect(batchCommand).toBeDefined();
    if (!batchCommand) return;

    const result = await batchCommand.handler(["1+1", "2*3"], {
      userId: "test",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor",
    });
    expect(result).toMatchObject({
      type: "batch-operation",
      message: "Batch calculation queued",
    });
  });

  test("provides view registry access", () => {
    const shell = harness.getShell();
    const viewRegistry = shell.getViewRegistry();

    expect(viewRegistry).toBeDefined();
    expect(viewRegistry.registerRoute).toBeDefined();
    // The registerRoutes (plural) method is provided by ServicePluginContext, not ViewRegistry directly
  });

  test("provides content generation", () => {
    const shell = harness.getShell();
    const contentGenerator = shell.getContentGenerator();

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

  test("provides calc:add command", async () => {
    // Find the calc:add command
    const addCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:add",
    );
    expect(addCommand).toBeDefined();
    expect(addCommand?.description).toBe("Add two numbers");

    // Test the command
    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(addCommand).toBeDefined();
    if (!addCommand) return;

    const result = await addCommand.handler(["10", "5"], mockContext);
    expect(result).toEqual({
      type: "message",
      message: "10 + 5 = 15",
    });
  });

  test("provides calc:batch command", async () => {
    const batchCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:batch",
    );
    expect(batchCommand).toBeDefined();

    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(batchCommand).toBeDefined();
    if (!batchCommand) return;

    const result = await batchCommand.handler(
      ["5*5", "10/2", "3+7"],
      mockContext,
    );

    expect(result.type).toBe("batch-operation");
    if (result.type === "batch-operation") {
      expect(result.operationCount).toBe(3);
      expect(result.batchId).toBeDefined();
    }
  });

  test("provides calc:history command", async () => {
    const historyCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:history",
    );
    expect(historyCommand).toBeDefined();

    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(historyCommand).toBeDefined();
    if (!historyCommand) return;

    const result = await historyCommand.handler(["5"], mockContext);

    expect(result.type).toBe("message");
    expect(result.message).toContain("No calculations in history");
  });

  test("provides calc:explain command with AI generation", async () => {
    const explainCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc:explain",
    );
    expect(explainCommand).toBeDefined();

    const mockContext = {
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "test",
      userPermissionLevel: "anchor" as const,
    };

    expect(explainCommand).toBeDefined();
    if (!explainCommand) return;

    const result = await explainCommand.handler(["add", "5", "3"], mockContext);

    expect(result.type).toBe("message");
    // The handler now correctly extracts the message from the response
    expect(result.message).toBe("Generated content for math-explanation");
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
