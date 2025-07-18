import { describe, expect, it, beforeEach } from "bun:test";
import { calculatorInterfacePlugin } from "../examples/calculator-interface-plugin";
import { createMockInterfaceServices } from "./__mocks__/mockInterfaceServices";
import { createInterfacePluginContext } from "../src/contexts/interfacePluginContext";
import type { PluginCapabilities } from "../src/types";

describe("Calculator Interface Plugin (Behavioral)", () => {
  let mockServices: ReturnType<typeof createMockInterfaceServices>;
  let capabilities: PluginCapabilities;
  let context: ReturnType<typeof createInterfacePluginContext>;

  beforeEach(async () => {
    mockServices = createMockInterfaceServices();
    context = createInterfacePluginContext(
      calculatorInterfacePlugin,
      mockServices,
    );
    capabilities = await calculatorInterfacePlugin.register(context);
  });

  it("provides calculator commands to users", () => {
    const commandNames = capabilities.commands.map((cmd) => cmd.name);
    expect(commandNames).toContain("calc");
    expect(commandNames).toContain("calc-history");
    expect(commandNames).toContain("calc-ask");
    expect(commandNames).toContain("calc-status");
    expect(commandNames).toContain("calc-clear");
  });

  it("calculates expressions correctly", async () => {
    const calcCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc",
    );

    expect(await calcCommand!.handler(["2", "+", "2"])).toBe("2+2 = 4");
    expect(await calcCommand!.handler(["10", "-", "3"])).toBe("10-3 = 7");
    expect(await calcCommand!.handler(["5", "*", "6"])).toBe("5*6 = 30");
    expect(await calcCommand!.handler(["15", "/", "3"])).toBe("15/3 = 5");
  });

  it("handles errors gracefully", async () => {
    const calcCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc",
    );

    // Division by zero
    const divByZero = await calcCommand!.handler(["5", "/", "0"]);
    expect(divByZero).toContain("Error");
    expect(divByZero).toContain("Division by zero");

    // Invalid expression
    const invalid = await calcCommand!.handler(["invalid"]);
    expect(invalid).toContain("Error");

    // No arguments
    const noArgs = await calcCommand!.handler([]);
    expect(noArgs).toContain("Usage");
    expect(noArgs).toContain("calc <expression>");
  });

  it("processes natural language math questions", async () => {
    const askCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc-ask",
    );

    // Mock a specific response for this test
    mockServices.shell.generateContent.mockImplementationOnce(() =>
      Promise.resolve({
        message: "To find 20% of 150, I calculate: 150 × 0.20 = 30",
        summary: "Percentage calculation",
        topics: ["math", "percentage"],
        sources: [],
        metadata: {},
      }),
    );

    const result = await askCommand!.handler([
      "what",
      "is",
      "20%",
      "of",
      "150?",
    ]);
    expect(result).toContain("30");
    expect(result).toContain("150");
  });

  it("shows system status", async () => {
    const statusCommand = capabilities.commands.find(
      (cmd) => cmd.name === "calc-status",
    );

    const status = await statusCommand!.handler([]);
    expect(status).toContain("Calculator Status:");
    expect(status).toContain("History entries:");
    expect(status).toContain("Active calculation jobs:");
    expect(status).toContain("Active batches:");
  });

  it("provides only interface capabilities", () => {
    // Interface plugins should only provide commands, not tools or resources
    expect(capabilities.tools).toHaveLength(0);
    expect(capabilities.resources).toHaveLength(0);
    expect(capabilities.commands.length).toBeGreaterThan(0);
  });

  it("supports plugin lifecycle", async () => {
    // These should not throw
    await expect(calculatorInterfacePlugin.start()).resolves.toBeUndefined();
    await expect(calculatorInterfacePlugin.stop()).resolves.toBeUndefined();
  });
});
