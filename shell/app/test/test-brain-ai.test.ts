import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  createNoAIService,
  createNoEmbeddingService,
} from "../src/testing/no-ai-provider";

const noProvider = "A test brain has no AI provider";

/** Why a call was refused; a call that answers fails the test. */
async function refusal(call: PromiseLike<unknown>): Promise<string> {
  return caughtError(await Promise.resolve(call).catch(caughtError)).message;
}

describe("a test brain's AI", () => {
  it("refuses every generation without reaching a provider", async () => {
    const ai = createNoAIService({ model: "none" });

    expect(await refusal(ai.generateText("system", "user"))).toBe(noProvider);
    expect(
      await refusal(ai.generateObject("system", "user", z.object({}))),
    ).toBe(noProvider);
    expect(
      await refusal(
        ai.judge({
          instruction: "Judge",
          material: "Material",
          schema: z.object({}),
        }),
      ),
    ).toBe(noProvider);
    expect(await refusal(ai.generateImage("a picture"))).toBe(noProvider);
    expect(ai.canGenerateImages()).toBe(false);
  });

  it("hands the agent a model that refuses every call", async () => {
    const model = createNoAIService({ model: "none" }).getModel();
    if (typeof model === "string") throw new Error("Expected a model object");

    expect(model.modelId).toBe("none");
    expect(await refusal(model.doGenerate({ prompt: [] }))).toBe(noProvider);
    expect(await refusal(model.doStream({ prompt: [] }))).toBe(noProvider);
  });

  it("keeps its configuration as the runtime's AI does", () => {
    const ai = createNoAIService({ model: "none", temperature: 0.7 });

    expect(ai.getConfig()).toEqual({ model: "none", temperature: 0.7 });
    ai.updateConfig({ temperature: 0.2 });
    expect(ai.getConfig()).toEqual({ model: "none", temperature: 0.2 });
  });

  it("computes no embeddings", async () => {
    const embeddings = createNoEmbeddingService();

    expect(await refusal(embeddings.generateEmbedding("text"))).toBe(
      noProvider,
    );
    expect(await refusal(embeddings.generateEmbeddings(["text"]))).toBe(
      noProvider,
    );
  });
});
