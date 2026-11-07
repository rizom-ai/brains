import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { AIService } from "../src/aiService";
import {
  createProviderClients,
  getLanguageModel,
} from "../src/provider-clients";

describe("language models", () => {
  it("serves a local model from the model runtime's chat API", () => {
    const clients = createProviderClients({
      model: "local:qwen3:4b",
      modelRuntimeUrl: "http://models:11434",
    });

    const model = getLanguageModel(clients, "local:qwen3:4b");

    expect(typeof model === "string" ? model : model.provider).toBe(
      "local.chat",
    );
    expect(typeof model === "string" ? model : model.modelId).toBe("qwen3:4b");
  });

  it("asks the runtime for output in the requested schema", () => {
    const clients = createProviderClients({
      model: "local:qwen3:4b",
      modelRuntimeUrl: "http://models:11434",
    });

    const model = getLanguageModel(clients, "local:qwen3:4b");

    expect(
      typeof model !== "string" &&
        "supportsStructuredOutputs" in model &&
        model.supportsStructuredOutputs,
    ).toBe(true);
  });

  it("refuses a local model without the model runtime", () => {
    const clients = createProviderClients({ model: "local:qwen3:4b" });

    expect(() => getLanguageModel(clients, "local:qwen3:4b")).toThrow(
      "local:qwen3:4b needs modelRuntime.url",
    );
  });
});

describe("the answer model", () => {
  it("is served from the model runtime when configured", () => {
    const ai = AIService.createFresh(
      {
        model: "local:qwen3:30b-a3b",
        answerModel: "local:qwen3:30b-a3b-instruct-2507-q4_K_M",
        modelRuntimeUrl: "http://models:11434",
      },
      createSilentLogger(),
    );

    const answer = ai.getAnswerModel();

    expect(typeof answer === "object" ? answer.modelId : answer).toBe(
      "qwen3:30b-a3b-instruct-2507-q4_K_M",
    );
  });

  it("is absent unless configured", () => {
    const ai = AIService.createFresh(
      { model: "local:qwen3:30b-a3b", modelRuntimeUrl: "http://models:11434" },
      createSilentLogger(),
    );

    expect(ai.getAnswerModel()).toBeUndefined();
  });
});
