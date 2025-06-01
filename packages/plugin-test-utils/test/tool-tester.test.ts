import { describe, it, expect } from "bun:test";
import { ToolTester, createToolTester } from "../src/tool-tester";
import type { PluginTool } from "@brains/types";
import { z } from "zod";

describe("ToolTester", () => {
  const createTestTool = (): PluginTool => ({
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      message: z.string(),
      count: z.number().optional(),
    },
    handler: async (input: unknown): Promise<unknown> => {
      const parsed = z
        .object({
          message: z.string(),
          count: z.number().optional(),
        })
        .parse(input);

      if (parsed.message === "error") {
        throw new Error("Test error");
      }

      return {
        result: parsed.message,
        count: parsed.count ?? 1,
      };
    },
  });

  it("should execute tool successfully", async () => {
    const tool = createTestTool();
    const tester = createToolTester(tool);

    const result = await tester.execute({ message: "hello" });
    expect(result).toEqual({ result: "hello", count: 1 });
  });

  it("should test validation with valid and invalid inputs", async () => {
    const tool = createTestTool();
    const tester = new ToolTester(tool);

    const validInputs = [{ message: "test" }, { message: "test", count: 5 }];

    const invalidInputs = [
      {}, // missing required message
      { message: 123 }, // wrong type
      { message: "test", count: "not a number" }, // wrong type
    ];

    // Should not throw for valid test
    await tester.testValidation(validInputs, invalidInputs);
  });

  it("should expect and catch errors", async () => {
    const tool = createTestTool();
    const tester = createToolTester(tool);

    const error = await tester.expectError({ message: "error" }, "Test error");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Test error");
  });

  it("should get tool metadata", () => {
    const tool = createTestTool();
    const tester = createToolTester(tool);

    const metadata = tester.getMetadata();
    expect(metadata.name).toBe("test_tool");
    expect(metadata.description).toBe("A test tool");
    expect(metadata.inputSchema).toBeDefined();
  });

  it("should return error when expecting error but tool succeeds", async () => {
    const tool = createTestTool();
    const tester = createToolTester(tool);

    const error = await tester.expectError({ message: "success" });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      "Expected tool to throw an error but it succeeded",
    );
  });
});
