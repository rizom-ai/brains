import { describe, test, expect, beforeEach } from "bun:test";
import { createServicePluginContext } from "../src/contexts/servicePluginContext";
import { createMockServiceServices } from "./__mocks__/mockServiceServices";
import { calculatorServicePlugin } from "../examples/calculator-service-plugin";

describe("Calculator Service Plugin - ServicePluginContext Integration", () => {
  let mockServices: ReturnType<typeof createMockServiceServices>;
  let context: ReturnType<typeof createServicePluginContext>;

  beforeEach(() => {
    mockServices = createMockServiceServices();
    context = createServicePluginContext(calculatorServicePlugin, mockServices);
  });

  test("service plugin provides tools for external systems", async () => {
    const capabilities = await calculatorServicePlugin.register(context);
    const calculateTool = capabilities.tools[0];
    
    const result = await calculateTool.handler({ expression: "2 + 2" });
    
    expect(result).toEqual({
      result: 4,
      calculationId: "calc-123",
    });
  });

  test("service plugin provides resources for content discovery", async () => {
    const capabilities = await calculatorServicePlugin.register(context);
    const historyResource = capabilities.resources[0];
    
    const result = await historyResource.handler();
    
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toMatchObject({
      uri: "calculation://1",
      mimeType: "application/json",
    });
  });

  test("calc:explain command generates AI explanations", async () => {
    const capabilities = await calculatorServicePlugin.register(context);
    const explainCmd = capabilities.commands.find(c => c.name === "calc:explain");
    
    const result = await explainCmd!.handler(["addition"]);
    
    expect(result).toBe("Addition is the process of combining two or more numbers.");
  });

  test("calc:history command shows past calculations", async () => {
    const capabilities = await calculatorServicePlugin.register(context);
    const historyCmd = capabilities.commands.find(c => c.name === "calc:history");
    
    const result = await historyCmd!.handler([]);
    
    expect(result).toBe("formatted content"); // Mock always returns this
    expect(mockServices.contentGenerator.formatContent).toHaveBeenCalledWith(
      "calculation-history",
      expect.objectContaining({ calculations: expect.arrayContaining([
        expect.objectContaining({ expression: "2+2", result: "4" })
      ])}),
      expect.any(Object)
    );
  });

  test("calc:batch command queues multiple calculations", async () => {
    const capabilities = await calculatorServicePlugin.register(context);
    const batchCmd = capabilities.commands.find(c => c.name === "calc:batch");
    
    const result = await batchCmd!.handler(["2+2", "3*3", "4*4"]);
    
    expect(result).toBe("Batch calculation queued with ID: batch-456");
  });

  test("service plugin can persist calculation results", async () => {
    await calculatorServicePlugin.register(context);
    
    // Get the job handler that was registered
    const handlerCall = (mockServices.jobQueueService.registerHandler as any).mock.calls[0];
    const handler = handlerCall[1];
    
    await handler({ 
      id: "job-1", 
      data: { expression: "5+5" },
      type: "complex-calculation"
    });
    
    expect(mockServices.entityService.createEntity).toHaveBeenCalled();
  });

  test("service plugin registers web UI routes", async () => {
    await calculatorServicePlugin.register(context);
    
    expect(mockServices.shell.registerRoutes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/calculator",
          title: "Calculator",
        })
      ]),
      expect.any(Object)
    );
  });
});