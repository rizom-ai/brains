import type { CorePlugin, CorePluginContext } from "../src";
import { z } from "zod";

/**
 * Example Calculator Plugin
 * Demonstrates how to create a simple core plugin that:
 * - Registers commands
 * - Registers tools (for MCP)
 * - Uses messaging
 */
export const calculatorPlugin: CorePlugin = {
  id: "calculator",
  version: "1.0.0",
  type: "core",
  description: "Simple calculator plugin",

  async register(context: CorePluginContext) {
    // Register calculator commands
    context.registerCommand({
      name: "calc:add",
      description: "Add two numbers",
      usage: "calc:add <num1> <num2>",
      handler: async (args) => {
        const [a, b] = args.map(Number);
        if (isNaN(a) || isNaN(b)) {
          return "Error: Please provide two valid numbers";
        }
        return `${a} + ${b} = ${a + b}`;
      },
    });

    context.registerCommand({
      name: "calc:multiply",
      description: "Multiply two numbers",
      usage: "calc:multiply <num1> <num2>",
      handler: async (args) => {
        const [a, b] = args.map(Number);
        if (isNaN(a) || isNaN(b)) {
          return "Error: Please provide two valid numbers";
        }
        return `${a} × ${b} = ${a * b}`;
      },
    });

    // Register MCP tool for more complex calculations
    context.registerTool({
      name: "calculate",
      description: "Perform calculations",
      inputSchema: z.object({
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      }),
      handler: async ({ operation, a, b }) => {
        switch (operation) {
          case "add":
            return { result: a + b, expression: `${a} + ${b} = ${a + b}` };
          case "subtract":
            return { result: a - b, expression: `${a} - ${b} = ${a - b}` };
          case "multiply":
            return { result: a * b, expression: `${a} × ${b} = ${a * b}` };
          case "divide":
            if (b === 0) {
              throw new Error("Division by zero");
            }
            return { result: a / b, expression: `${a} ÷ ${b} = ${a / b}` };
        }
      },
    });

    // Subscribe to calculation requests from other plugins
    context.subscribe("calc:request", async (message) => {
      context.logger.debug("Received calculation request", message);
      
      // For now, just acknowledge the request
      // In a real implementation, you might process the request
      // and send back results
      return { success: true };
    });

    context.logger.info("Calculator plugin registered successfully");
  },
};