import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineTool,
  firstPartyTool,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A first-party service converted from a class keeps its tools' names, some
 * of which were written in snake case (`atproto-registry_check_contracts`).
 * The public `defineTool` keeps its kebab-case rule; `firstPartyTool` admits
 * an underscore for first-party packages only.
 */

const lexiconCount = firstPartyTool({
  name: "check_contracts",
  description: "Count the lexicons.",
  input: z.object({}),
  output: z.object({ count: z.number() }),
  sideEffects: "none",
  execute: () => ({ count: 3 }),
});

describe("a first-party tool", () => {
  it("keeps a snake-case name and runs as a declared tool", async () => {
    const registry = defineServicePlugin(
      { id: "registry", config: z.object({}) },
      { tools: () => [lexiconCount] },
    );
    const plugins = instantiatePluginPackageDefinition(
      registry,
      {},
      { name: "@brains/registry", version: "0.1.0" },
      { pluginId: "registry" },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    for (const plugin of plugins) await harness.installPlugin(plugin);

    const tool = harness
      .getCapabilities()
      .tools.find(({ name }) => name === "registry_check_contracts");
    if (!tool) throw new Error("registry_check_contracts was not registered");
    expect(tool.sideEffects).toBe("none");
    expect(
      await tool.handler(
        {},
        { interfaceType: "test", actor: { kind: "user", userId: "test" } },
      ),
    ).toEqual({ success: true, data: { count: 3 } });
    await harness.reset();
  });

  it("is still refused by the public defineTool", () => {
    expect(() =>
      defineTool({
        name: "check_contracts",
        description: "Count the lexicons.",
        input: z.object({}),
        output: z.object({}),
        execute: () => ({}),
      }),
    ).toThrow(/Tool name/);
  });

  it("is refused for a name that is not a lowercase identifier", () => {
    for (const name of [
      "Check_contracts",
      "_check",
      "9lives",
      "check contracts",
    ]) {
      expect(() =>
        firstPartyTool({
          name,
          description: "x",
          input: z.object({}),
          output: z.object({}),
          execute: () => ({}),
        }),
      ).toThrow(/First-party tool name/);
    }
  });

  it("is refused without a description", () => {
    expect(() =>
      firstPartyTool({
        name: "check",
        description: " ",
        input: z.object({}),
        output: z.object({}),
        execute: () => ({}),
      }),
    ).toThrow(/description/);
  });
});
