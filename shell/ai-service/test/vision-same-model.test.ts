import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { generateText, type ModelMessage } from "ai";
import { AIService } from "../src/aiService";

/** The model runtime's chat requests, each answered with a short reply. */
let requests: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  globalThis.fetch = Object.assign(
    async (
      _input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ): Promise<Response> => {
      requests.push(
        z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))),
      );
      return Response.json({
        id: `chatcmpl-${requests.length}`,
        object: "chat.completion",
        created: 0,
        model: "m",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "A harbor at dawn." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
    { preconnect: realFetch.preconnect },
  );
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const upload: ModelMessage = {
  role: "user",
  content: [
    { type: "text", text: "What is in this image?" },
    {
      type: "file",
      data: new Uint8Array([137, 80, 78, 71]),
      mediaType: "image/png",
      filename: "harbor.png",
    },
  ],
};

async function ask(visionModel: string): Promise<void> {
  const service = AIService.createFresh(
    {
      model: "local:qwen3.6:35b",
      visionModel,
      modelRuntimeUrl: "http://models:11434",
    },
    createSilentLogger(),
  );
  await generateText({ model: service.getModel(), messages: [upload] });
}

describe("a local model named as the vision model too", () => {
  it("sees an uploaded image itself, with nothing described", async () => {
    await ask("local:qwen3.6:35b");

    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0])).toContain("image_url");
  });
});

describe("a local model with another vision model", () => {
  it("is told what the vision model saw in the image", async () => {
    await ask("local:qwen3-vl:8b");

    expect(requests.map((request) => request["model"])).toEqual([
      "qwen3-vl:8b",
      "qwen3.6:35b",
    ]);
    expect(JSON.stringify(requests[1])).not.toContain("image_url");
    expect(JSON.stringify(requests[1])).toContain("A harbor at dawn.");
  });
});
