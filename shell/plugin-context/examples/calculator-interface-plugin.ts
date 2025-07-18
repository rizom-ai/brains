import type {
  InterfacePlugin,
  InterfacePluginContext,
  PluginCapabilities,
} from "../src";

/**
 * Calculator Interface Plugin
 * Demonstrates how the same calculator functionality can be exposed
 * through an interface plugin that focuses on user interaction
 * rather than service/entity operations.
 *
 * This plugin shows:
 * - Query processing for natural language math questions
 * - Command-based calculator interface
 * - Status monitoring of calculation jobs
 * - Long-running daemon for calculator server
 */
export const calculatorInterfacePlugin: InterfacePlugin = {
  id: "calculator-interface",
  version: "1.0.0",
  type: "interface",
  description: "Calculator interface with natural language query support",

  async register(context: InterfacePluginContext): Promise<PluginCapabilities> {
    // Register templates for formatting calculator output
    context.registerTemplates({
      "calc-result": {
        name: "calc-result",
        description: "Format calculation result",
        generate: async (data: { expression: string; result: number }) => {
          return `${data.expression} = ${data.result}`;
        },
      },
      "calc-history": {
        name: "calc-history",
        description: "Format calculation history",
        generate: async (data: {
          history: Array<{ expression: string; result: number }>;
        }) => {
          if (data.history.length === 0) {
            return "No calculations in history";
          }
          return data.history
            .map((item, i) => `${i + 1}. ${item.expression} = ${item.result}`)
            .join("\n");
        },
      },
    });

    // In-memory calculation history for this session
    const calculationHistory: Array<{
      expression: string;
      result: number;
      timestamp: Date;
    }> = [];

    // Register a daemon for continuous calculator monitoring
    context.registerDaemon("calc-monitor", {
      start: async () => {
        context.logger.info("Calculator monitor daemon started");
        // In a real implementation, this could monitor for calculation patterns,
        // provide suggestions, or handle batch calculations
      },
      stop: async () => {
        context.logger.info("Calculator monitor daemon stopped");
      },
      healthCheck: async () => {
        return {
          status: "healthy" as const,
          message: "Calculator interface is operational",
          lastCheck: new Date(),
          details: {
            historySize: calculationHistory.length,
            uptime: process.uptime(),
          },
        };
      },
    });

    // Subscribe to calculation events from other plugins
    context.subscribe("calculator:result", async (message) => {
      const { expression, result } = message.payload as {
        expression: string;
        result: number;
      };
      calculationHistory.push({ expression, result, timestamp: new Date() });
      context.logger.info("Recorded calculation", { expression, result });
    });

    // Helper function to evaluate simple math expressions
    const evaluateExpression = (expr: string): number => {
      // In a real implementation, use a proper expression parser
      // For demo, handle basic operations
      const cleaned = expr.replace(/\s/g, "");

      // Simple regex for basic operations
      const match = cleaned.match(
        /^(\d+(?:\.\d+)?)([\+\-\*\/])(\d+(?:\.\d+)?)$/,
      );
      if (!match) {
        throw new Error("Invalid expression format");
      }

      const [, num1, op, num2] = match;
      const a = parseFloat(num1);
      const b = parseFloat(num2);

      switch (op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new Error("Division by zero");
          return a / b;
        default:
          throw new Error(`Unknown operator: ${op}`);
      }
    };

    context.logger.info("Calculator interface plugin registered");

    // Return interface-specific commands
    return {
      tools: [], // Interface plugins don't expose tools
      resources: [], // Interface plugins don't expose resources
      commands: [
        {
          name: "calc",
          description: "Perform a calculation",
          usage: "calc <expression>",
          handler: async (args) => {
            if (args.length === 0) {
              return "Usage: calc <expression>\nExample: calc 2 + 2";
            }

            const expression = args.join(" ");
            try {
              const result = evaluateExpression(expression);
              // Use cleaned expression for consistent formatting
              const cleanedExpression = expression.replace(/\s/g, "");

              // Publish result for other plugins
              await context.sendMessage("calculator:result", {
                expression: cleanedExpression,
                result,
              });

              return context.formatContent("calc-result", {
                expression: cleanedExpression,
                result,
              });
            } catch (error) {
              return `Error: ${error instanceof Error ? error.message : "Invalid expression"}`;
            }
          },
        },
        {
          name: "calc-history",
          description: "Show calculation history",
          usage: "calc-history [limit]",
          handler: async (args) => {
            const limit = args[0] ? parseInt(args[0], 10) : 10;
            const recentHistory = calculationHistory
              .slice(-limit)
              .map((item) => ({
                expression: item.expression,
                result: item.result,
              }));

            return context.formatContent("calc-history", {
              history: recentHistory,
            });
          },
        },
        {
          name: "calc-ask",
          description: "Ask a natural language math question",
          usage: "calc-ask <question>",
          handler: async (args) => {
            if (args.length === 0) {
              return "Please provide a math question";
            }

            const question = args.join(" ");

            try {
              // Use the query method to process natural language
              const response = await context.query(
                `Please solve this math problem and show the calculation: ${question}`,
                {
                  plugin: "calculator-interface",
                  requestType: "calculation",
                },
              );

              // Extract any calculations from the response and add to history
              // In a real implementation, you'd parse the response for calculations
              const calcMatch = response.message.match(
                /(\d+(?:\.\d+)?[\s]*[\+\-\*\/][\s]*\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/,
              );
              if (calcMatch) {
                const [, expression, result] = calcMatch;
                await context.sendMessage("calculator:result", {
                  expression: expression.replace(/\s/g, ""),
                  result: parseFloat(result),
                });
              }

              return response.message;
            } catch (error) {
              context.logger.error("Query failed", error);
              return "Sorry, I couldn't process your math question.";
            }
          },
        },
        {
          name: "calc-status",
          description: "Show calculator system status",
          usage: "calc-status",
          handler: async () => {
            // Get active jobs that might be calculator-related
            const activeJobs = await context.getActiveJobs([
              "calculation",
              "batch-calc",
            ]);
            const activeBatches = await context.getActiveBatches();

            let status = "Calculator Status:\n";
            status += `History entries: ${calculationHistory.length}\n`;
            status += `Active calculation jobs: ${activeJobs.length}\n`;
            status += `Active batches: ${activeBatches.length}\n`;

            if (calculationHistory.length > 0) {
              const lastCalc =
                calculationHistory[calculationHistory.length - 1];
              status += `\nLast calculation: ${lastCalc.expression} = ${lastCalc.result}`;
              status += ` (${new Date(lastCalc.timestamp).toLocaleTimeString()})`;
            }

            return status;
          },
        },
        {
          name: "calc-clear",
          description: "Clear calculation history",
          usage: "calc-clear",
          handler: async () => {
            const count = calculationHistory.length;
            calculationHistory.length = 0;
            return `Cleared ${count} calculations from history`;
          },
        },
      ],
    };
  },

  async start(): Promise<void> {
    // Start the calculator interface
    console.log("Calculator interface starting...");
    // In a real implementation, this might start a REPL or web server
  },

  async stop(): Promise<void> {
    // Stop the calculator interface
    console.log("Calculator interface stopping...");
    // Clean up any resources
  },
};
