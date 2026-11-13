import { describe, expect, it } from "bun:test";
import {
  generateText,
  jsonSchema,
  stepCountIs,
  tool,
  type ModelMessage,
} from "ai";
import { MockLanguageModelV3 } from "ai/test";
import {
  withLocalRuntime,
  type LocalRuntimeOptions,
} from "../src/local-runtime-model";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type Call = MockLanguageModelV3["doGenerateCalls"][number];

const usage: ModelResponse["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function respond(content: ModelResponse["content"]): ModelResponse {
  return {
    content,
    finishReason: content.some((part) => part.type === "tool-call")
      ? { unified: "tool-calls", raw: "tool_calls" }
      : { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  };
}

const reply = (text: string): ModelResponse =>
  respond([{ type: "text", text }]);
/** The turn a thinking model ends after settling on a call in its reasoning. */
const silence = (): ModelResponse =>
  respond([{ type: "reasoning", text: "So the tool call should be..." }]);

/** A model that answers each call with the next response in turn. */
function scripted(responses: ModelResponse[]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => {
      const next = responses.shift();
      if (!next) throw new Error("No more responses");
      return next;
    },
  });
}

/** A vision model that describes what it is shown, or fails. */
function visionModel(description: string | Error): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    modelId: "vision",
    doGenerate: async (): Promise<ModelResponse> => {
      if (description instanceof Error) throw description;
      return reply(description);
    },
  });
}

// A one-page PDF whose only text is "Distributed Systems Primer".
const primerPdf = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcyMCBUZCAoRGlzdHJpYnV0ZWQgU3lzdGVtcyBQcmltZXIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==",
  "base64",
);

const uploads: ModelMessage = {
  role: "user",
  content: [
    { type: "text", text: "Summarize these." },
    {
      type: "file",
      data: new Uint8Array(primerPdf),
      mediaType: "application/pdf",
      filename: "distributed-systems-primer.pdf",
    },
    {
      type: "file",
      data: new Uint8Array([137, 80, 78, 71]),
      mediaType: "image/png",
      filename: "harbor.png",
    },
  ],
};

const save = tool({
  description: "Save a note",
  inputSchema: jsonSchema({
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
    additionalProperties: false,
  }),
  execute: async () => "Saved.",
});

/** The user parts of the prompt the runtime's model received. */
function userParts(call: Call | undefined): { type: string; text?: string }[] {
  if (!call) throw new Error("The model was not called");
  return call.prompt.flatMap((message) =>
    message.role === "user" ? message.content : [],
  );
}

async function sendUploads(
  options: LocalRuntimeOptions,
  times = 1,
): Promise<MockLanguageModelV3> {
  const inner = scripted(Array.from({ length: times }, () => reply("Done.")));
  const model = withLocalRuntime(inner, options);
  for (const _time of Array.from({ length: times }))
    await generateText({ model, messages: [uploads] });
  return inner;
}

describe("uploads for a local model that reads only text", () => {
  it("reach it as a PDF's text and the name of a file it cannot read", async () => {
    const parts = userParts((await sendUploads({})).doGenerateCalls[0]);

    expect(parts.map((part) => part.type)).toEqual(["text", "text", "text"]);
    const [, pdf, image] = parts;
    expect(pdf?.text).toContain('"distributed-systems-primer.pdf"');
    expect(pdf?.text).toContain("Distributed Systems Primer");
    expect(image?.text).toContain('"harbor.png"');
    expect(image?.text).toContain("Its contents are not shown to you.");
  });

  it("reach a model that reads images as a PDF's text and the image itself", async () => {
    const parts = userParts(
      (await sendUploads({ readsImages: true })).doGenerateCalls[0],
    );

    expect(parts.map((part) => part.type)).toEqual(["text", "text", "file"]);
    expect(parts[1]?.text).toContain("Distributed Systems Primer");
  });

  it("reach it with the vision model's description of an image", async () => {
    const vision = visionModel("A harbor at dawn, with two fishing boats.");

    const inner = await sendUploads({ describeImagesWith: vision });

    expect(userParts(inner.doGenerateCalls[0])[2]?.text).toContain(
      "It shows: A harbor at dawn, with two fishing boats.",
    );
    expect(
      userParts(vision.doGenerateCalls[0]).some((part) => part.type === "file"),
    ).toBe(true);
  });

  it("have each image described once", async () => {
    const vision = visionModel("A harbor at dawn.");

    await sendUploads({ describeImagesWith: vision }, 2);

    expect(vision.doGenerateCalls).toHaveLength(1);
  });

  it("name an image without a description when the vision model fails", async () => {
    const inner = await sendUploads({
      describeImagesWith: visionModel(new Error("runtime down")),
    });

    expect(userParts(inner.doGenerateCalls[0])[2]?.text).toContain(
      "Its contents are not shown to you.",
    );
  });
});

describe("a first step that ends with no reply and no call", () => {
  it("is asked again, constrained to a call of one of its tools, counting both", async () => {
    const inner = scripted([
      silence(),
      reply('{"tool":"system_create","input":{"title":"Harbor"}}'),
    ]);

    const result = await generateText({
      model: withLocalRuntime(inner, {}),
      prompt: "Keep these files.",
      tools: { system_create: save },
    });

    expect(result.steps[0]?.toolCalls.map((call) => call.input)).toEqual([
      { title: "Harbor" },
    ]);
    // Both attempts count toward the turn.
    expect(result.usage.inputTokens).toBe(2);
    expect(
      inner.doGenerateCalls.map((call) => call.responseFormat?.type),
    ).toEqual([undefined, "json"]);
  });

  it("is kept when the constrained answer is still no call", async () => {
    const inner = scripted([silence(), reply("not a call")]);

    const result = await generateText({
      model: withLocalRuntime(inner, {}),
      prompt: "Keep these files.",
      tools: { system_create: save },
    });

    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([]);
    expect(inner.doGenerateCalls).toHaveLength(2);
  });

  it("is kept when it has no tools to call", async () => {
    const inner = scripted([silence()]);

    const result = await generateText({
      model: withLocalRuntime(inner, {}),
      prompt: "Keep these files.",
    });

    expect(result.text).toBe("");
    expect(inner.doGenerateCalls).toHaveLength(1);
  });

  it("is kept after a tool result, which it answers", async () => {
    const inner = scripted([silence()]);

    await generateText({
      model: withLocalRuntime(inner, {}),
      messages: [
        { role: "user", content: "Keep these files." },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "system_create",
              input: { title: "Harbor" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "system_create",
              output: { type: "text", value: "Saved." },
            },
          ],
        },
      ],
      tools: { system_create: save },
    });

    expect(inner.doGenerateCalls).toHaveLength(1);
  });
});

describe("a tool result", () => {
  const thinking = { local: { reasoningEffort: "low" } } as const;

  async function stepOptions(
    options: LocalRuntimeOptions,
    withEffort = true,
  ): Promise<unknown[]> {
    const inner = scripted([
      respond([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "system_create",
          input: JSON.stringify({ title: "Harbor" }),
        },
      ]),
      reply("Saved."),
    ]);
    await generateText({
      model: withLocalRuntime(inner, options),
      prompt: "Keep these files.",
      tools: { system_create: save },
      ...(withEffort && { providerOptions: thinking }),
      stopWhen: stepCountIs(2),
    });
    return inner.doGenerateCalls.map((call) => call.providerOptions);
  }

  it("is answered without thinking, after thinking to choose the tool", async () => {
    expect(await stepOptions({ answersWithoutThinking: true })).toEqual([
      thinking,
      { local: { reasoningEffort: "none" } },
    ]);
  });

  it("is answered as the runtime decides when no effort was asked for", async () => {
    expect(await stepOptions({ answersWithoutThinking: true }, false)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("is answered with the same effort when another model writes answers", async () => {
    expect(await stepOptions({})).toEqual([thinking, thinking]);
  });
});
