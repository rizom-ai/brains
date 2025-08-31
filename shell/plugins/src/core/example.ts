import { CorePlugin } from "./core-plugin";
import type { CorePluginContext } from "./context";
import type { Command, CommandResponse } from "@brains/command-registry";
import { z } from "@brains/utils";

/**
 * PLUGIN CONFIGURATION SCHEMA
 *
 * Best Practice: Always define a Zod schema for your plugin configuration.
 * This provides:
 * - Type safety at runtime
 * - Automatic validation
 * - Clear documentation of expected configuration
 */
const calculatorConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the calculator plugin").default(true),
  debug: z.boolean().describe("Enable debug logging").default(false),
});

type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;
type CalculatorConfigInput = Partial<CalculatorConfig>;

/**
 * EXAMPLE CALCULATOR PLUGIN - CORE PLUGIN TYPE
 *
 * This example demonstrates all CorePlugin capabilities:
 * - Command registration and execution
 * - Inter-plugin messaging via message bus
 * - Template registration for consistent formatting
 * - Structured logging with context
 *
 * Core plugins are best for:
 * - Business logic and data processing
 * - Background tasks and automation
 * - Integration with shell services
 *
 * @see ServicePlugin for service-oriented features
 * @see InterfacePlugin for user interface features
 */
export class CalculatorPlugin extends CorePlugin<CalculatorConfig> {
  constructor(config: CalculatorConfigInput = {}) {
    super(
      "calculator",
      {
        name: "@brains/calculator-plugin",
        version: "1.0.0",
        description:
          "Simple calculator plugin demonstrating Core plugin capabilities",
      },
      config,
      calculatorConfigSchema,
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
          format: (data: { result: string; timestamp: string }): string => {
            return `🧮 Result: ${data.result} (calculated at ${data.timestamp})`;
          },
          parse: (content: string): { result: string; timestamp: string } => {
            const match = content.match(
              /🧮 Result: (.*) \(calculated at (.*)\)/,
            );
            return { result: match?.[1] ?? "", timestamp: match?.[2] ?? "" };
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
          format: (data: { operation: string; operands?: string[] }): string => {
            return `The operation ${data.operation} was performed on ${data.operands?.join(", ") ?? "no operands"}`;
          },
          parse: (content: string): { operation: string; operands?: string[] } => {
            const match = content.match(
              /The operation (.*) was performed on (.*)/,
            );
            const operands = match?.[2]
              ?.split(", ")
              .filter((op) => op !== "no operands");
            return {
              operation: match?.[1] ?? "",
              ...(operands && { operands }),
            };
          },
        },
        requiredPermission: "public",
      },
    });
  }

  /**
   * PLUGIN LIFECYCLE: onRegister
   *
   * Called when the plugin is registered with the shell.
   * This is where you:
   * 1. Register commands, templates, and handlers
   * 2. Subscribe to message bus events
   * 3. Initialize plugin resources
   *
   * Best Practice: Keep initialization fast and non-blocking
   */
  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    // Step 1: Register templates for consistent formatting
    await this.registerTemplates(context);

    // Step 2: Subscribe to inter-plugin messages
    context.subscribe(
      "calc:request",
      async (message: {
        payload: { operation: string; a: number; b: number };
      }) => {
        this.info("Processing calculation request", message);

        const { operation, a, b } = message.payload;

        if (!operation || typeof a !== "number" || typeof b !== "number") {
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

  /**
   * COMMAND REGISTRATION
   *
   * Commands are the primary way users interact with plugins.
   *
   * Best Practices:
   * - Use namespaced command names (e.g., "calc:add")
   * - Provide clear descriptions and usage examples
   * - Validate arguments thoroughly
   * - Return structured responses using registered templates
   */
  protected override async getCommands(): Promise<Command[]> {
    return [
      {
        name: "calc:add",
        description: "Add two numbers",
        usage: "calc:add <num1> <num2>",
        handler: async (args): Promise<CommandResponse> => {
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
        handler: async (args): Promise<CommandResponse> => {
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
        handler: async (_args, context): Promise<CommandResponse> => {
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
        handler: async (args, _context): Promise<CommandResponse> => {
          const limit = args[0] ? parseInt(args[0], 10) : 5;

          // Use the context to access entity service (read-only)
          const ctx = this.getContext();

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
