import type { PluginTool } from "@brains/types";
import { z, type ZodRawShape } from "zod";

/**
 * Helper class for testing MCP tools
 */
export class ToolTester {
  constructor(private tool: PluginTool) {}

  /**
   * Test that the tool validates input correctly
   */
  async testValidation(
    validInputs: Array<Record<string, unknown>>,
    invalidInputs: Array<Record<string, unknown>>,
  ): Promise<void> {
    // Test valid inputs
    for (const input of validInputs) {
      try {
        await this.tool.handler(input);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(
            `Valid input failed validation: ${JSON.stringify(input)}\nError: ${error.message}`,
          );
        }
        // Other errors are okay - we're just testing validation
      }
    }

    // Test invalid inputs
    for (const input of invalidInputs) {
      let threw = false;
      try {
        await this.tool.handler(input);
      } catch (error) {
        if (error instanceof z.ZodError) {
          threw = true;
        }
      }
      if (!threw) {
        throw new Error(
          `Invalid input passed validation: ${JSON.stringify(input)}`,
        );
      }
    }
  }

  /**
   * Execute tool and return result
   */
  async execute<T = unknown>(input: Record<string, unknown> = {}): Promise<T> {
    return this.tool.handler(input) as Promise<T>;
  }

  /**
   * Execute tool and expect it to throw
   */
  async expectError(
    input: Record<string, unknown> = {},
    errorMessage?: string,
  ): Promise<Error> {
    try {
      await this.tool.handler(input);
      throw new Error("Expected tool to throw an error but it succeeded");
    } catch (error) {
      if (errorMessage && error instanceof Error) {
        if (!error.message.includes(errorMessage)) {
          throw new Error(
            `Expected error message to include "${errorMessage}" but got "${error.message}"`,
          );
        }
      }
      return error as Error;
    }
  }

  /**
   * Get tool metadata
   */
  getMetadata(): {
    name: string;
    description?: string;
    inputSchema?: ZodRawShape;
  } {
    return {
      name: this.tool.name,
      description: this.tool.description,
      inputSchema: this.tool.inputSchema,
    };
  }
}

/**
 * Create a tool tester instance
 */
export function createToolTester(tool: PluginTool): ToolTester {
  return new ToolTester(tool);
}