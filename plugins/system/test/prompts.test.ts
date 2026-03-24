import { describe, expect, it, beforeEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { PluginPrompt } from "@brains/plugins";

describe("System Plugin Prompts", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  const registeredPrompts: PluginPrompt[] = [];

  beforeEach(async () => {
    registeredPrompts.length = 0;

    harness = createPluginHarness({
      logger: createSilentLogger("system-prompts-test"),
    });

    const shell = harness.getMockShell();
    shell.registerPluginPrompt = (
      _pluginId: string,
      prompt: PluginPrompt,
    ): void => {
      registeredPrompts.push(prompt);
    };

    const plugin = new SystemPlugin();
    await harness.installPlugin(plugin);
  });

  function findPrompt(name: string): PluginPrompt {
    const prompt = registeredPrompts.find((p) => p.name === name);
    if (!prompt) throw new Error(`Prompt "${name}" not registered`);
    return prompt;
  }

  it("should register create prompt with required type arg", () => {
    const prompt = findPrompt("create");
    expect(prompt.args).toHaveProperty("type");
    expect(prompt.args).toHaveProperty("topic");
  });

  it("should register generate prompt with required type and topic", () => {
    const prompt = findPrompt("generate");
    expect(prompt.args).toHaveProperty("type");
    expect(prompt.args).toHaveProperty("topic");
  });

  it("should register review prompt with required type and id", () => {
    const prompt = findPrompt("review");
    expect(prompt.args).toHaveProperty("type");
    expect(prompt.args).toHaveProperty("id");
  });

  it("should register publish prompt", () => {
    findPrompt("publish");
  });

  it("should register brainstorm prompt with required topic", () => {
    const prompt = findPrompt("brainstorm");
    expect(prompt.args).toHaveProperty("topic");
  });

  describe("create prompt handler", () => {
    it("should generate message with topic", async () => {
      const prompt = findPrompt("create");
      const result = await prompt.handler({ type: "post", topic: "AI safety" });
      const text = result.messages[0]?.content.text ?? "";
      expect(text).toContain("post");
      expect(text).toContain("AI safety");
    });

    it("should generate message without topic", async () => {
      const prompt = findPrompt("create");
      const result = await prompt.handler({ type: "deck" });
      const text = result.messages[0]?.content.text ?? "";
      expect(text).toContain("deck");
    });
  });

  describe("brainstorm prompt handler", () => {
    it("should generate brainstorm message", async () => {
      const prompt = findPrompt("brainstorm");
      const result = await prompt.handler({ topic: "decentralized identity" });
      const text = result.messages[0]?.content.text ?? "";
      expect(text).toContain("decentralized identity");
    });
  });
});
