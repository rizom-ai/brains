import { ServicePlugin, type ServicePluginContext } from "../src";
import type { PluginTool, PluginResource } from "@brains/plugins";
import type { Command } from "@brains/command-registry";
import type { MessageWithPayload } from "@brains/messaging-service";
import type { DefaultQueryResponse } from "@brains/types";
import { z } from "zod";

// Define the plugin configuration schema
const calculatorConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the calculator service plugin"),
  debug: z.boolean().describe("Enable debug logging"),
  enableBatchProcessing: z
    .boolean()
    .describe("Enable batch calculation processing"),
  maxBatchSize: z
    .number()
    .describe("Maximum number of calculations in a batch"),
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
    const defaults: CalculatorConfig = {
      enabled: true,
      debug: false,
      enableBatchProcessing: true,
      maxBatchSize: 100,
    };

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
      defaults,
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
            return { result: match?.[1] || "", timestamp: match?.[2] || "" };
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
      },
      "calculation-history": {
        name: "calculation-history",
        description: "Format calculation history",
        requiredPermission: "public",
        schema: z.object({ calculations: z.array(z.any()) }),
        basePrompt: "",
        formatter: {
          format: (data: { calculations: any[] }) => {
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

        if (!operation || a === undefined || b === undefined) {
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
    context.registerJobHandler("complex-calculation", {
      async process(data: unknown, jobId: string) {
        context.logger.info("Processing complex calculation", { jobId });
        const { expression } = data as { expression: string };

        // Simulate complex calculation
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const result = eval(expression); // In real code, use a proper parser!

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

    // Register routes for web UI
    context.registerRoutes(
      [
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
              contentEntity: {
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
      {},
    );

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
        handler: async (input: any) => {
          const { expression } = input;
          const result = eval(expression); // In real code, use a proper parser!

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

          return { result, calculationId: calculation.entityId };
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
        handler: async () => {
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

  protected override async getCommands(): Promise<Command[]> {
    const context = this.getContext();

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
          const [aStr, bStr] = args;
          const a = Number(aStr);
          const b = Number(bStr);
          if (isNaN(a) || isNaN(b)) {
            return {
              type: "message",
              message: "Error: Please provide two valid numbers",
            };
          }
          context.logger.info(`Adding ${a} + ${b}`);
          return { type: "message", message: `${a} + ${b} = ${a + b}` };
        },
      },
      {
        name: "calc:format",
        description: "Format a calculation result",
        usage: "calc:format <result>",
        handler: async (args) => {
          const result = args[0];
          // Test content formatting
          return {
            type: "message",
            message: this.formatContent("calculation-result", {
              result,
              timestamp: new Date().toISOString(),
            }),
          };
        },
      },
      {
        name: "calc:explain",
        description: "Get AI explanation of a math concept",
        usage: "calc:explain <concept>",
        handler: async (args) => {
          const concept = args.join(" ");
          if (!concept) {
            return {
              type: "message",
              message: "Error: Please provide a concept to explain",
            };
          }

          // Use AI content generation
          const explanation = await this.generateContent<DefaultQueryResponse>({
            templateName: "math-explanation",
            prompt: `Explain the mathematical concept: ${concept}`,
            data: { operation: concept },
          });

          return { type: "message", message: explanation.message };
        },
      },
      {
        name: "calc:history",
        description: "Show calculation history",
        usage: "calc:history [limit]",
        handler: async () => {
          const calculations =
            await context.entityService.listEntities("calculation");

          if (calculations.length === 0) {
            return { type: "message", message: "No calculations in history" };
          }

          return {
            type: "message",
            message: this.formatContent("calculation-history", {
              calculations,
            }),
          };
        },
      },
      {
        name: "calc:batch",
        description: "Queue multiple calculations",
        usage: "calc:batch <expr1> <expr2> ...",
        handler: async (args) => {
          if (args.length === 0) {
            return {
              type: "message",
              message: "Error: Please provide expressions to calculate",
            };
          }

          const operations = args.map((expr) => ({
            type: "complex-calculation",
            data: { expression: expr },
          }));

          const batchId = await this.enqueueBatch(operations, {
            source: "calculator-plugin",
            metadata: {
              interfaceId: "cli",
              userId: "plugin-test",
              operationType: "batch_processing" as const,
            },
          });

          return {
            type: "batch-operation",
            message: `Batch calculation queued`,
            batchId,
            operationCount: args.length,
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
