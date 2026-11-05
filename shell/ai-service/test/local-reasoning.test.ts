import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { AIService } from "../src/aiService";

const chatRequest = z.object({ reasoning_effort: z.string().optional() });

/** An OpenAI-compatible runtime that records each chat request it answers. */
function startRuntime(): {
  url: string;
  requests: Array<z.output<typeof chatRequest>>;
  stop: () => void;
} {
  const requests: Array<z.output<typeof chatRequest>> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests.push(chatRequest.parse(await request.json()));
      return Response.json({
        id: "c",
        created: 0,
        model: "qwen3:14b",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: '{"answer":"yes"}' },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });
  return { url: server.url.origin, requests, stop: () => server.stop(true) };
}

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

describe("reasoning effort on the model runtime", () => {
  it("asks a local model for the configured reasoning effort", async () => {
    const runtime = startRuntime();
    stops.push(runtime.stop);
    const ai = AIService.createFresh(
      {
        model: "local:qwen3:14b",
        modelRuntimeUrl: runtime.url,
        reasoningEffort: "none",
      },
      createSilentLogger(),
    );

    await ai.generateText("System", "Hello");
    await ai.generateObject(
      "System",
      "Answer",
      z.object({ answer: z.string() }),
    );

    expect(runtime.requests.map((request) => request.reasoning_effort)).toEqual(
      ["none", "none"],
    );
  });

  it("leaves the model's own default when no effort is configured", async () => {
    const runtime = startRuntime();
    stops.push(runtime.stop);
    const ai = AIService.createFresh(
      { model: "local:qwen3:14b", modelRuntimeUrl: runtime.url },
      createSilentLogger(),
    );

    await ai.generateText("System", "Hello");

    expect(runtime.requests[0]?.reasoning_effort).toBeUndefined();
  });
});
