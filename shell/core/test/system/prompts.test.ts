import { describe, expect, it } from "bun:test";
import { createSystemPrompts } from "../../src/system/prompts";
import { createMockSystemServices } from "./mock-services";

describe("system prompts", () => {
  it("should create all expected prompts", () => {
    const prompts = createSystemPrompts(createMockSystemServices());
    const names = prompts.map((p) => p.name);

    expect(names).toContain("create");
    expect(names).toContain("generate");
    expect(names).toContain("review");
    expect(names).toContain("publish");
    expect(names).toContain("brainstorm");
  });

  it("create prompt should include topic in message", async () => {
    const prompts = createSystemPrompts(createMockSystemServices());
    const prompt = prompts.find((p) => p.name === "create");
    const result = await prompt?.handler({ type: "post", topic: "TypeScript" });

    expect(result?.messages[0]?.content).toHaveProperty("text");
    const text = (result?.messages[0]?.content as { text: string }).text;
    expect(text).toContain("TypeScript");
    expect(text).toContain("post");
  });

  it("create prompt without topic should ask user", async () => {
    const prompts = createSystemPrompts(createMockSystemServices());
    const prompt = prompts.find((p) => p.name === "create");
    const result = await prompt?.handler({ type: "note" });

    const text = (result?.messages[0]?.content as { text: string }).text;
    expect(text).toContain("Ask me");
  });

  it("brainstorm prompt should include topic", async () => {
    const prompts = createSystemPrompts(createMockSystemServices());
    const prompt = prompts.find((p) => p.name === "brainstorm");
    const result = await prompt?.handler({ topic: "AI agents" });

    const text = (result?.messages[0]?.content as { text: string }).text;
    expect(text).toContain("AI agents");
  });
});
