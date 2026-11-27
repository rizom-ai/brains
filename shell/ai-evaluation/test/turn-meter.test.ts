import { describe, expect, it } from "bun:test";
import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { measureTurn } from "../src/turn-meter";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

/** A model that answers with `text` and reports a usage of its own. */
function model(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 90, text: 90, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

describe("measureTurn", () => {
  it("counts the turn's model calls with the reference tokenizer, not the model's usage", async () => {
    const { value, calls, referenceTokens } = await measureTurn(async () => {
      const result = await generateText({
        model: model("hello world"),
        prompt: "hello world",
      });
      return result.text;
    });

    expect(value).toBe("hello world");
    expect(calls).toBe(1);
    expect(referenceTokens).toBe(4);
  });

  it("adds every call the turn makes", async () => {
    const { calls, referenceTokens } = await measureTurn(async () => {
      await generateText({ model: model("hello world"), prompt: "one" });
      await generateText({ model: model("hello world"), prompt: "two" });
    });

    expect(calls).toBe(2);
    expect(referenceTokens).toBe(
      countTokens("one") + countTokens("two") + 2 * 2,
    );
  });

  it("leaves out calls made outside the turn while it runs", async () => {
    const background = generateText({
      model: model("a reply that is not the turn's own"),
      prompt: "a background derivation outside the turn",
    });
    const turn = measureTurn(async () => {
      await generateText({ model: model("hello world"), prompt: "hi" });
    });
    const [{ calls, referenceTokens }] = await Promise.all([turn, background]);

    expect(calls).toBe(1);
    expect(referenceTokens).toBe(countTokens("hi") + 2);
  });

  it("reports no calls for a turn that made none", async () => {
    const { calls, referenceTokens } = await measureTurn(async () => "done");

    expect(calls).toBe(0);
    expect(referenceTokens).toBe(0);
  });
});
