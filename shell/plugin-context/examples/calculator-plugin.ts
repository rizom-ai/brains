import type { CorePlugin, CorePluginContext, PluginCapabilities } from "../src";

/**
 * Example Calculator Plugin - Core Plugin
 * Tests CorePluginContext capabilities:
 * - Command definition and execution
 * - Inter-plugin messaging  
 * - Template formatting (no AI generation)
 * - Logging
 */
export const calculatorPlugin: CorePlugin = {
  id: "calculator",
  version: "1.0.0",
  type: "core",
  description: "Simple calculator plugin demonstrating Core plugin capabilities",

  async register(context: CorePluginContext): Promise<PluginCapabilities> {
    // Test template registration
    context.registerTemplates({
      "calculation-result": {
        name: "calculation-result",
        description: "Format calculation results",
        generate: async (data: { result: string; timestamp: string }) => {
          return `🧮 Result: ${data.result} (calculated at ${data.timestamp})`;
        },
      },
      "math-explanation": {
        name: "math-explanation",
        description: "Explain math operations",
        generate: async (data: { operation: string; operands?: string[] }) => {
          return `The operation ${data.operation} was performed on ${data.operands?.join(", ")}`;
        },
      },
    });

    // Test messaging - subscribe to requests
    context.subscribe(
      "calc:request",
      async (message: {
        id?: string;
        payload?: { operation: string; a: number; b: number };
      }) => {
        context.logger.info("Processing calculation request", message);

        const { operation, a, b } = message.payload || {};
        let result: number;

        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "multiply":
            result = a * b;
            break;
          default:
            return { success: false, error: "Unknown operation" };
        }

        // Send result back via messaging
        await context.sendMessage("calc:result", {
          requestId: message.id,
          result,
          operation,
          operands: [a, b],
        });

        return { success: true };
      },
    );

    // Test template formatting (no AI generation in Core plugins)
    const formatted = context.formatContent("math-explanation", {
      operation: "addition",
      operands: ["5", "3"],
    });
    context.logger.info("Formatted content:", formatted);

    context.logger.info(
      "Calculator plugin registered with all CorePluginContext features tested",
    );

    // Return capabilities (standard plugin pattern)
    return {
      tools: [], // Core plugins don't expose tools
      resources: [],
      commands: [
        {
          name: "calc:add",
          description: "Add two numbers",
          usage: "calc:add <num1> <num2>",
          handler: async (args) => {
            const [a, b] = args.map(Number);
            if (isNaN(a) || isNaN(b)) {
              return "Error: Please provide two valid numbers";
            }
            context.logger.info(`Adding ${a} + ${b}`);
            return `${a} + ${b} = ${a + b}`;
          },
        },
        {
          name: "calc:format",
          description: "Format a calculation result",
          usage: "calc:format <result>",
          handler: async (args) => {
            const result = args[0];
            // Test content formatting
            return context.formatContent("calculation-result", {
              result,
              timestamp: new Date().toISOString(),
            });
          },
        },
      ],
    };
  },
};
