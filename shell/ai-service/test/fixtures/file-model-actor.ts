import { createOpenAI } from "@ai-sdk/openai";
import { runFileModelActor } from "../../src/file-model-actor";

// Explicit external-provider substitute, never a production endpoint fallback.
runFileModelActor(import.meta.url, {
  getModel: (config) => {
    if (!config.apiKey) throw new Error("Missing fixture endpoint");
    return createOpenAI({
      baseURL: config.apiKey,
      apiKey: "fixture",
      headers: { "x-fixture-pid": String(process.pid) },
    }).responses(config.model);
  },
});
