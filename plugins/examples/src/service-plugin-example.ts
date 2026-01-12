import { ServicePlugin } from "@brains/plugins";
import type {
  ServicePluginContext,
  PluginTool,
  PluginResource,
  ToolResponse,
  MessageWithPayload,
} from "@brains/plugins";
import { z } from "@brains/utils";

// Define the plugin configuration schema
const calculatorConfigSchema = z.object({
  enabled: z
    .boolean()
    .describe("Enable the calculator service plugin")
    .default(true),
  debug: z.boolean().describe("Enable debug logging").default(false),
  enableBatchProcessing: z
    .boolean()
    .describe("Enable batch calculation processing")
    .default(true),
  maxBatchSize: z
    .number()
    .describe("Maximum number of calculations in a batch")
    .default(100),
});

type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;
type CalculatorConfigInput = Partial<CalculatorConfig>;

/**
 * Example Calculator Service Plugin
 * Demonstrates ServicePlugin capabilities:
 * - Everything from Core (messaging, templates, logging)
 * - Content generation with AI
 * - Entity service for storing calculation history
 * - Job queue for async calculations
 * - Routes for web UI
 */
export class CalculatorServicePlugin extends ServicePlugin<CalculatorConfig> {
  constructor(config: CalculatorConfigInput = {}) {
    super(
      "calculator-service",
      {
        name: "@brains/calculator-service-plugin",
        version: "1.0.0",
        description:
          "Advanced calculator plugin demonstrating Service plugin capabilities",
      },
      config,
      calculatorConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register templates
    context.registerTemplates({
      "calculation-result": {
        name: "calculation-result",
        description: "Format calculation results",
        requiredPermission: "public",
        schema: z.object({ result: z.string(), timestamp: z.string() }),
        basePrompt: "",
        formatter: {
          format: (data: { result: string; timestamp: string }) => {
            return `🧮 Result: ${data.result} (calculated at ${data.timestamp})`;
          },
          parse: (content: string) => {
            const match = content.match(
              /🧮 Result: (.*) \(calculated at (.*)\)/,
            );
            return { result: match?.[1] ?? "", timestamp: match?.[2] ?? "" };
          },
        },
      },
      "math-explanation": {
        name: "math-explanation",
        description: "Explain math operations",
        requiredPermission: "public",
        schema: z.object({
          operation: z.string(),
          operands: z.array(z.string()).optional(),
        }),
        basePrompt: "",
        formatter: {
          format: (data: { operation: string; operands?: string[] }) => {
            return `The operation ${data.operation} was performed on ${data.operands?.join(", ") ?? "no operands"}`;
          },
          parse: (content: string) => {
            const match = content.match(
              /The operation (.*) was performed on (.*)/,
            );
            return {
              operation: match?.[1] ?? "",
              operands: match?.[2]
                ?.split(", ")
                .filter((op) => op !== "no operands"),
            };
          },
        },
      },
      "calculation-history": {
        name: "calculation-history",
        description: "Format calculation history",
        requiredPermission: "public",
        schema: z.object({ calculations: z.array(z.any()) }),
        basePrompt: "",
        formatter: {
          format: (data: {
            calculations: Array<{ expression: string; result: number }>;
          }) => {
            return data.calculations
              .map((calc) => `${calc.expression} = ${calc.result}`)
              .join("\n");
          },
          parse: (content: string) => {
            const lines = content.split("\n");
            const calculations = lines.map((line) => {
              const [expression, result] = line.split(" = ");
              return { expression, result };
            });
            return { calculations };
          },
        },
      },
    });

    // Subscribe to calculation requests
    context.subscribe(
      "calc:request",
      async (
        message: MessageWithPayload<{
          operation: string;
          a: number;
          b: number;
        }>,
      ) => {
        context.logger.info("Processing calculation request", message);

        const { operation, a, b } = message.payload;
        let result: number;

        if (!operation || typeof a !== "number" || typeof b !== "number") {
          return { success: false, error: "Missing required parameters" };
        }

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

    // Test AI content generation
    const explanation = await context.generateContent({
      templateName: "math-explanation",
      prompt: "Explain the mathematical concept of addition",
      data: {
        operation: "addition",
        operands: ["numbers", "values"],
      },
    });
    context.logger.info("Generated explanation:", explanation);

    // Register job handler for complex calculations
    context.jobs.registerHandler("complex-calculation", {
      async process(data: unknown, jobId: string) {
        context.logger.info("Processing complex calculation", { jobId });
        const { expression } = data as { expression: string };

        // Simulate complex calculation
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // WARNING: In production code, NEVER use eval()!
        // Use a proper math expression parser like mathjs or expr-eval
        // Example: import { evaluate } from 'mathjs';
        //          const result = evaluate(expression);
        // For demo purposes only:
        const result = eval(expression);

        // Store in entity service
        await context.entityService.createEntity({
          entityType: "calculation",
          content: `${expression} = ${result}`,
          metadata: {
            expression,
            result: result.toString(),
            timestamp: new Date().toISOString(),
          },
        });

        return { result };
      },
      validateAndParse(data: unknown): { expression: string } | null {
        const schema = z.object({ expression: z.string() });
        const parsed = schema.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
    });

    // Register routes for web UI (if site-builder plugin is available)
    // Routes are now managed through the site-builder plugin via message bus
    // To register routes, send a message to the site-builder plugin:
    await context.sendMessage("plugin:site-builder:route:register", {
      routes: [
        {
          id: "calculator-home",
          path: "/calculator",
          title: "Calculator",
          description: "Advanced calculator with history",
          sections: [
            {
              id: "calculator-ui",
              template: "calculator-interface",
            },
            {
              id: "recent-calculations",
              template: "calculation-history",
              dataQuery: {
                entityType: "calculation",
                query: {
                  limit: 10,
                  orderBy: "timestamp",
                  orderDirection: "desc",
                },
              },
            },
          ],
        },
      ],
      pluginId: this.id,
      environment: "preview",
    });

    context.logger.info(
      "Calculator service plugin registered with all ServicePluginContext features tested",
    );

    // Call parent implementation
    await super.onRegister(context);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const context = this.getContext();

    return [
      {
        name: "calculate",
        description: "Perform mathematical calculations",
        inputSchema: {
          expression: z.string().describe("Math expression to evaluate"),
        },
        handler: async (input): Promise<ToolResponse> => {
          const parsed = z.object({ expression: z.string() }).parse(input);
          const { expression } = parsed;

          // WARNING: In production code, NEVER use eval()!
          // Use a proper math expression parser like mathjs or expr-eval
          // This is for demonstration purposes only
          const result = eval(expression);

          // Store calculation in entity service
          const calculation = await context.entityService.createEntity({
            entityType: "calculation",
            content: `${expression} = ${result}`,
            metadata: {
              expression,
              result: result.toString(),
              timestamp: new Date().toISOString(),
            },
          });

          return {
            success: true,
            data: {
              result: result.toString(),
              calculationId: calculation.entityId,
            },
            formatted: `${expression} = ${result}`,
          };
        },
      },
    ];
  }

  protected override async getResources(): Promise<PluginResource[]> {
    const context = this.getContext();

    return [
      {
        uri: "calculation://history",
        name: "Calculation History",
        description: "Recent calculations performed",
        mimeType: "application/json",
        handler: async (): Promise<{
          contents: Array<{
            text: string;
            uri: string;
            mimeType?: string;
          }>;
        }> => {
          const calculations =
            await context.entityService.listEntities("calculation");
          return {
            contents: calculations.map((calc) => ({
              text: JSON.stringify(calc),
              uri: `calculation://${calc.id}`,
              mimeType: "application/json",
            })),
          };
        },
      },
    ];
  }
}

// Export a factory function for easy instantiation
export function calculatorServicePlugin(
  config?: CalculatorConfigInput,
): CalculatorServicePlugin {
  return new CalculatorServicePlugin(config);
}
