import { CorePlugin } from "@brains/plugins";
import type { CorePluginContext, PluginTool } from "@brains/plugins";
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
export class ExampleCorePlugin extends CorePlugin<CalculatorConfig> {
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
          format: (data: {
            operation: string;
            operands?: string[];
          }): string => {
            return `The operation ${data.operation} was performed on ${data.operands?.join(", ") ?? "no operands"}`;
          },
          parse: (
            content: string,
          ): { operation: string; operands?: string[] } => {
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
   * TOOL REGISTRATION
   *
   * Tools are the primary way AI agents interact with plugins.
   *
   * Best Practices:
   * - Use namespaced tool names (e.g., "calc_add")
   * - Provide clear descriptions
   * - Define input schemas with Zod
   * - Return structured responses
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: "calc_add",
        description: "Add two numbers",
        inputSchema: {
          a: z.number().describe("First number"),
          b: z.number().describe("Second number"),
        },
        handler: async (input: unknown) => {
          const args = z.object({ a: z.number(), b: z.number() }).parse(input);
          this.info(`Adding ${args.a} + ${args.b}`);
          return {
            message: `${args.a} + ${args.b} = ${args.a + args.b}`,
          };
        },
      },
      {
        name: "calc_format",
        description: "Format a calculation result",
        inputSchema: {
          result: z.string().describe("Result to format"),
        },
        handler: async (input: unknown) => {
          const args = z.object({ result: z.string() }).parse(input);
          const formatted = this.formatContent("calculation-result", {
            result: args.result,
            timestamp: new Date().toISOString(),
          });
          return { message: formatted };
        },
      },
    ];
  }
}

// Export a factory function for easy instantiation
export function calculatorPlugin(
  config?: CalculatorConfigInput,
): ExampleCorePlugin {
  return new ExampleCorePlugin(config);
}
