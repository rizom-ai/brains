import { describe, expect, it } from "bun:test";
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
