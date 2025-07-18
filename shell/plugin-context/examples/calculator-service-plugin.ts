import type {
  ServicePlugin,
  ServicePluginContext,
  PluginCapabilities,
} from "../src";

/**
 * Example Calculator Service Plugin
 * Tests ServicePluginContext capabilities:
 * - Everything from Core (messaging, templates, logging)
 * - Content generation with AI
 * - Entity service for storing calculation history
 * - Job queue for async calculations
 * - Routes for web UI
 */
export const calculatorServicePlugin: ServicePlugin = {
  id: "calculator-service",
  version: "1.0.0",
  type: "service",
  description:
    "Advanced calculator plugin demonstrating Service plugin capabilities",

  async register(context: ServicePluginContext): Promise<PluginCapabilities> {
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
      "calculation-history": {
        name: "calculation-history",
        description: "Format calculation history",
        generate: async (data: { calculations: any[] }) => {
          return data.calculations
            .map((calc) => `${calc.expression} = ${calc.result}`)
            .join("\n");
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

    // Test AI content generation (Service plugins have this capability)
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
    context.registerJobHandler("complex-calculation", async (job) => {
      context.logger.info("Processing complex calculation", { jobId: job.id });
      const { expression } = job.data as { expression: string };
      // Simulate complex calculation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = eval(expression); // In real code, use a proper parser!

      // Store in entity service
      await context.entityService.createEntity({
        entityType: "calculation",
        expression,
        result: result.toString(),
        timestamp: new Date().toISOString(),
      });

      return { result };
    });

    // Register routes for web UI
    context.registerRoutes([
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
    ]);

    context.logger.info(
      "Calculator service plugin registered with all ServicePluginContext features tested",
    );

    // Return capabilities with tools, resources, and commands
    return {
      tools: [
        {
          name: "calculate",
          description: "Perform mathematical calculations",
          inputSchema: {
            type: "object",
            properties: {
              expression: {
                type: "string",
                description: "Math expression to evaluate",
              },
            },
            required: ["expression"],
          },
          handler: async (input: any) => {
            const { expression } = input;
            const result = eval(expression); // In real code, use a proper parser!

            // Store calculation in entity service
            const calculation = await context.entityService.createEntity({
              entityType: "calculation",
              expression,
              result: result.toString(),
              timestamp: new Date().toISOString(),
            });

            return { result, calculationId: calculation.id };
          },
        },
      ],
      resources: [
        {
          uri: "calculation://history",
          name: "Calculation History",
          description: "Recent calculations performed",
          mimeType: "application/json",
          handler: async () => {
            const calculations = await context.entityService.listEntities({
              entityType: "calculation",
              limit: 20,
              orderBy: "timestamp",
              orderDirection: "desc",
            });
            return {
              contents: calculations.entities.map((calc) => ({
                text: JSON.stringify(calc),
                uri: `calculation://${calc.id}`,
                mimeType: "application/json",
              })),
            };
          },
        },
      ],
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
        {
          name: "calc:explain",
          description: "Get AI explanation of a math concept",
          usage: "calc:explain <concept>",
          handler: async (args) => {
            const concept = args.join(" ");
            if (!concept) {
              return "Error: Please provide a concept to explain";
            }

            // Use AI content generation
            const explanation = await context.generateContent({
              templateName: "math-explanation",
              prompt: `Explain the mathematical concept: ${concept}`,
              data: { operation: concept },
            });

            return explanation as string;
          },
        },
        {
          name: "calc:history",
          description: "Show calculation history",
          usage: "calc:history [limit]",
          handler: async (args) => {
            const limit = parseInt(args[0]) || 10;

            const calculations = await context.entityService.listEntities({
              entityType: "calculation",
              limit,
              orderBy: "timestamp",
              orderDirection: "desc",
            });

            if (calculations.entities.length === 0) {
              return "No calculations in history";
            }

            return context.formatContent("calculation-history", {
              calculations: calculations.entities,
            });
          },
        },
        {
          name: "calc:batch",
          description: "Queue multiple calculations",
          usage: "calc:batch <expr1> <expr2> ...",
          handler: async (args) => {
            if (args.length === 0) {
              return "Error: Please provide expressions to calculate";
            }

            const operations = args.map((expr) => ({
              type: "complex-calculation",
              data: { expression: expr },
            }));

            const batchId = await context.enqueueBatch(operations, {
              priority: 1,
            });

            return `Batch calculation queued with ID: ${batchId}`;
          },
        },
      ],
    };
  },
};
