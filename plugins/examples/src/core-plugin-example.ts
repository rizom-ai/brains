import { ServicePlugin } from "@brains/plugins";
import type { ServicePluginContext, Tool } from "@brains/plugins";
import { z } from "@brains/utils";

const calculatorConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the calculator plugin").default(true),
  debug: z.boolean().describe("Enable debug logging").default(false),
});

type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;
type CalculatorConfigInput = Partial<CalculatorConfig>;

/**
 * Example ServicePlugin — demonstrates messaging and tool registration.
 */
export class ExampleServicePlugin extends ServicePlugin<CalculatorConfig> {
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

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.messaging.subscribe(
      "calc:request",
      async (message: {
        payload: { operation: string; a: number; b: number };
      }) => {
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

        await context.messaging.send("calc:result", {
          result,
          operation,
          operands: [a, b],
        });

        return { success: true, data: result };
      },
    );

    this.logger.info("Calculator plugin registered successfully");
  }

  protected override async getTools(): Promise<Tool[]> {
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
          const result = `${args.a} + ${args.b} = ${args.a + args.b}`;
          return { success: true, message: result };
        },
      },
    ];
  }
}

export function calculatorPlugin(
  config?: CalculatorConfigInput,
): ExampleServicePlugin {
  return new ExampleServicePlugin(config);
}
