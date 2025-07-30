import { CorePlugin, type CorePluginContext } from "@brains/core-plugin";
import type { Command } from "@brains/command-registry";
import { z } from "zod";

// Define the plugin configuration schema
const calculatorConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the calculator plugin"),
  debug: z.boolean().describe("Enable debug logging"),
});

type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;
type CalculatorConfigInput = Partial<CalculatorConfig>;

/**
 * Example Calculator Plugin - Core Plugin
 * Demonstrates CorePluginContext capabilities:
 * - Command definition and execution
 * - Inter-plugin messaging
 * - Template registration and formatting
 * - Logging
 */
export class CalculatorPlugin extends CorePlugin<CalculatorConfig> {
  constructor(config: CalculatorConfigInput = {}) {
    const defaults: CalculatorConfig = {
      enabled: true,
      debug: false,
    };

    super(
      "calculator",
      {
        name: "@brains/calculator-plugin",
        version: "1.0.0",
        description:
          "Simple calculator plugin demonstrating Core plugin capabilities",
      },
      { ...defaults, ...config },
      calculatorConfigSchema,
      defaults,
    );
  }

  private async registerTemplates(context: CorePluginContext): Promise<void> {
    context.registerTemplates({
      "calculation-result": {
        name: "calculation-result",
        description: "Format calculation results",
        schema: z.object({
          result: z.string(),
          timestamp: z.string(),
        }),
        basePrompt: "",
        formatter: {
          format: (data: { result: string; timestamp: string }) => {
            return `🧮 Result: ${data.result} (calculated at ${data.timestamp})`;
          },
          parse: (content: string) => {
            const match = content.match(
              /🧮 Result: (.*) \(calculated at (.*)\)/,
            );
            return { result: match?.[1] || "", timestamp: match?.[2] || "" };
          },
        },
        requiredPermission: "public",
      },
      "math-explanation": {
        name: "math-explanation",
        description: "Explain math operations",
        schema: z.object({
          operation: z.string(),
          operands: z.array(z.string()).optional(),
        }),
        basePrompt: "",
        formatter: {
          format: (data: { operation: string; operands?: string[] }) => {
            return `The operation ${data.operation} was performed on ${data.operands?.join(", ") || "no operands"}`;
          },
          parse: (content: string) => {
            const match = content.match(
              /The operation (.*) was performed on (.*)/,
            );
            return {
              operation: match?.[1] || "",
              operands: match?.[2]
                ?.split(", ")
                .filter((op) => op !== "no operands"),
            };
          },
        },
        requiredPermission: "public",
      },
    });
  }

  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    // Register templates first
    await this.registerTemplates(context);

    // Subscribe to calculation requests
    context.subscribe(
      "calc:request",
      async (message: {
        payload: { operation: string; a: number; b: number };
      }) => {
        this.info("Processing calculation request", message);

        const { operation, a, b } = message.payload || {};

        if (!operation || a === undefined || b === undefined) {
          return { success: false, error: "Missing required parameters" };
        }

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
          result,
          operation,
          operands: [a, b],
        });

        // Note: A full implementation might store calculations as entities here
        // Since CorePlugin only has read access, this would require ServicePlugin
        // Example: await context.createEntity({ type: "calculation", ... })

        return { success: true, data: result };
      },
    );

    // Template formatting will be available after registration completes
    this.info("Calculator plugin registered successfully");
  }

  protected override async getCommands(): Promise<Command[]> {
    return [
      {
        name: "calc:add",
        description: "Add two numbers",
        usage: "calc:add <num1> <num2>",
        handler: async (args) => {
          if (args.length < 2) {
            return {
              type: "message",
              message: "Error: Please provide two numbers",
            };
          }
          const a = Number(args[0]);
          const b = Number(args[1]);
          if (isNaN(a) || isNaN(b)) {
            return {
              type: "message",
              message: "Error: Please provide two valid numbers",
            };
          }
          this.info(`Adding ${a} + ${b}`);
          return {
            type: "message",
            message: `${a} + ${b} = ${a + b}`,
          };
        },
      },
      {
        name: "calc:format",
        description: "Format a calculation result",
        usage: "calc:format <result>",
        handler: async (args) => {
          const result = args[0];
          // Test content formatting
          const formatted = this.formatContent("calculation-result", {
            result,
            timestamp: new Date().toISOString(),
          });
          return {
            type: "message",
            message: formatted,
          };
        },
      },
      {
        name: "calc:stats",
        description: "Show calculation statistics",
        usage: "calc:stats",
        handler: async (_args, context) => {
          // Demonstrate permission-based responses
          if (context.userPermissionLevel === "public") {
            return {
              type: "message",
              message: "Statistics are only available for trusted users",
            };
          }

          // In a real plugin, this might track actual usage
          return {
            type: "message",
            message: `📊 Calculator Statistics:\n- Total calculations: 42\n- Most used operation: add\n- User level: ${context.userPermissionLevel}`,
          };
        },
      },
      {
        name: "calc:history",
        description: "Show recent calculations",
        usage: "calc:history [limit]",
        handler: async (args, _context) => {
          const limit = args[0] ? parseInt(args[0], 10) : 5;

          // Use the context to access entity service (read-only)
          const ctx = this.getContext();
          if (!ctx) {
            return { type: "message", message: "Context not available" };
          }

          try {
            // Search for calculation entities using the entity service
            const results = await ctx.entityService.search("calculation", {
              limit,
              sortBy: "created",
              sortDirection: "desc",
            });

            if (results.length === 0) {
              return {
                type: "message",
                message:
                  "No calculation history found. Try performing some calculations first!",
              };
            }

            const history = results
              .map((result, index) => `${index + 1}. ${result.excerpt}`)
              .join("\n");

            return {
              type: "message",
              message: `📜 Recent calculations:\n${history}`,
            };
          } catch (error) {
            this.error("Failed to fetch calculation history", error);
            return {
              type: "message",
              message: "Failed to retrieve calculation history",
            };
          }
        },
      },
    ];
  }
}

// Export a factory function for easy instantiation
export function calculatorPlugin(
  config?: CalculatorConfigInput,
): CalculatorPlugin {
  return new CalculatorPlugin(config);
}
