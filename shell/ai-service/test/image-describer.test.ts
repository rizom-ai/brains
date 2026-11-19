import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { AIService } from "../src/aiService";

/** The model runtime's chat requests, each answered with one sentence. */
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
            message: { role: "assistant", content: " A harbor at dawn. " },
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

const harbor = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  mediaType: "image/png",
};

function service(config: { model: string; visionModel?: string }): AIService {
  return AIService.createFresh(
    {
      ...config,
      modelRuntimeUrl: "http://models:11434",
      providerKeys: { openai: "sk-test" },
    },
    createSilentLogger(),
  );
}

describe("describing an image", () => {
  it("asks the vision model, with the image and the instruction", async () => {
    const ai = service({
      model: "local:qwen3.6:35b",
      visionModel: "local:qwen3-vl:8b",
    });

    expect(ai.canDescribeImages()).toBe(true);
    expect(await ai.describeImage(harbor, "Say what it shows.")).toBe(
      "A harbor at dawn.",
    );
    expect(requests.map((request) => request["model"])).toEqual([
      "qwen3-vl:8b",
    ]);
    expect(JSON.stringify(requests[0])).toContain("image_url");
    expect(JSON.stringify(requests[0])).toContain("Say what it shows.");
  });

  it("cannot, with a local model and no vision model", async () => {
    const ai = service({ model: "local:qwen3.6:35b" });

    expect(ai.canDescribeImages()).toBe(false);
    expect(await ai.describeImage(harbor, "Say what it shows.")).toBe(
      undefined,
    );
    expect(requests).toEqual([]);
  });

  it("can with a cloud model, which reads images itself", () => {
    expect(service({ model: "gpt-4o-mini" }).canDescribeImages()).toBe(true);
  });
});
