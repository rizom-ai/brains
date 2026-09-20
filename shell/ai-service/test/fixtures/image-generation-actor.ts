import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { runImageGenerationActor } from "../../src/image-generation-actor";

// Explicit test artifact: only the provider endpoint binding differs. The real
// SDK and production actor protocol run here, never a patched controller fetch.
runImageGenerationActor(import.meta.url, {
  clients: (config) => {
    if (!config.imageApiKey) throw new Error("Missing fixture origin");
    const headers = { "x-fixture-pid": String(process.pid) };
    return {
      anthropicProvider: anthropic,
      openaiProvider: createOpenAI({
        apiKey: "fixture",
        baseURL: config.imageApiKey,
        headers,
      }),
      googleProvider: createGoogleGenerativeAI({
        apiKey: "fixture",
        baseURL: config.imageApiKey,
        headers,
      }),
    };
  },
});
