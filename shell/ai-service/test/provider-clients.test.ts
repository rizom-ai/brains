import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { AIService } from "../src/aiService";
import {
  canGenerateImages,
  checkModels,
  createLocalRuntimeClient,
  createProviderClients,
  getImageModel,
  getLanguageModel,
} from "../src/provider-clients";

function providerOf(model: unknown): string | undefined {
  return typeof model === "object" && model !== null && "provider" in model
    ? String(model.provider)
    : undefined;
}

describe("language models", () => {
  it("serves a local model from the model runtime's chat API", () => {
    const clients = createProviderClients({
      modelRuntimeUrl: "http://models:11434",
    });

    const model = getLanguageModel(clients, "local:qwen3:4b");

    expect(providerOf(model)).toBe("local.chat");
    expect(typeof model === "string" ? model : model.modelId).toBe("qwen3:4b");
  });

  it("asks the runtime for output in the requested schema", () => {
    const model = createLocalRuntimeClient("http://models:11434").chatModel(
      "qwen3:4b",
    );

    expect(
      "supportsStructuredOutputs" in model && model.supportsStructuredOutputs,
    ).toBe(true);
  });

  it("refuses a local model without the model runtime", () => {
    const clients = createProviderClients({});

    expect(() => getLanguageModel(clients, "local:qwen3:4b")).toThrow(
      "local:qwen3:4b needs modelRuntime.url",
    );
  });

  it("serves each model from its own provider", () => {
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test", openai: "sk-proj-test" },
    });

    expect(providerOf(getLanguageModel(clients, "claude-sonnet-5"))).toBe(
      "anthropic.messages",
    );
    expect(providerOf(getLanguageModel(clients, "gpt-6-luna"))).toBe(
      "openai.responses",
    );
  });

  it("names the variable a model's provider key comes from", () => {
    const clients = createProviderClients({
      providerKeys: { openai: "sk-proj-test" },
    });

    expect(() => getLanguageModel(clients, "claude-sonnet-5")).toThrow(
      "claude-sonnet-5 needs ANTHROPIC_API_KEY",
    );
  });

  it("never hands one provider's key to another", () => {
    // Claude chat with a Gemini image model: the OpenAI client must not
    // be built from the Google or Anthropic key.
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test", google: "AIzatest" },
    });

    expect(() => getLanguageModel(clients, "gpt-6-luna")).toThrow(
      "gpt-6-luna needs OPENAI_API_KEY",
    );
  });

  it("refuses an unknown provider", () => {
    const clients = createProviderClients({
      providerKeys: { openai: "sk-proj-test" },
    });

    expect(() => getLanguageModel(clients, "mystery:model")).toThrow(
      'mystery:model: unknown provider "mystery"',
    );
  });
});

describe("image models", () => {
  it("are served by their provider", () => {
    const clients = createProviderClients({
      providerKeys: { google: "AIzatest" },
    });

    expect(
      providerOf(getImageModel(clients, "gemini-3-pro-image-preview")),
    ).toContain("google");
  });

  it("are refused by a provider that makes none", () => {
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test" },
    });

    expect(() => getImageModel(clients, "anthropic:claude-image")).toThrow(
      "anthropic:claude-image: Anthropic has no image models",
    );
  });

  it("are offered only when their provider has a key", () => {
    expect(canGenerateImages(createProviderClients({}), undefined)).toBe(false);
    expect(
      canGenerateImages(
        createProviderClients({ providerKeys: { openai: "sk-proj-test" } }),
        undefined,
      ),
    ).toBe(true);
    expect(
      canGenerateImages(
        createProviderClients({ providerKeys: { anthropic: "sk-ant-test" } }),
        "anthropic:claude-image",
      ),
    ).toBe(false);
  });
});

describe("model checks", () => {
  it("pass when every configured model has its provider", () => {
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test", openai: "sk-proj-test" },
    });

    expect(
      checkModels(clients, {
        model: "claude-sonnet-5",
        embeddingModel: "openai:text-embedding-3-small",
      }),
    ).toEqual([]);
  });

  it("report each model whose provider is missing or cannot serve it", () => {
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test" },
    });

    expect(
      checkModels(clients, {
        model: "claude-sonnet-5",
        visionModel: "gpt-6-luna",
        imageModel: "anthropic:claude-image",
        embeddingModel: "openai:text-embedding-3-small",
      }),
    ).toEqual([
      {
        role: "visionModel",
        model: "gpt-6-luna",
        message: "gpt-6-luna needs OPENAI_API_KEY",
      },
      {
        role: "imageModel",
        model: "anthropic:claude-image",
        message: "anthropic:claude-image: Anthropic has no image models",
      },
      {
        role: "embeddingModel",
        model: "openai:text-embedding-3-small",
        message: "openai:text-embedding-3-small needs OPENAI_API_KEY",
      },
    ]);
  });

  it("report an embedding model that is not supported", () => {
    const clients = createProviderClients({
      providerKeys: { anthropic: "sk-ant-test" },
    });

    expect(
      checkModels(clients, { embeddingModel: "anthropic:embed" }).map(
        (problem) => problem.message,
      ),
    ).toEqual([
      expect.stringContaining('Unsupported embedding model "anthropic:embed"'),
    ]);
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
