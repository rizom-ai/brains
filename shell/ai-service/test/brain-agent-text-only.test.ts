import { describe, expect, it } from "bun:test";
import { createMockMessageBus } from "@brains/messaging-service/test";
import type { ModelMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createBrainAgentFactory } from "../src/brain-agent";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type Prompt = MockLanguageModelV3["doGenerateCalls"][number]["prompt"];

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

async function promptFor(modelId: string): Promise<Prompt> {
  const model = new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => ({
      content: [{ type: "text", text: "Done." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  const agent = createBrainAgentFactory({
    model,
    modelId,
    messageBus: createMockMessageBus(),
  })({
    identity: {
      name: "Brain",
      role: "Researcher",
      purpose: "Help",
      values: [],
    },
    tools: [],
    getToolsForPermission: () => [],
  });
  await agent.generate({
    messages: [uploads],
    options: {
      conversationId: "conv-1",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
  const [call] = model.doGenerateCalls;
  if (!call) throw new Error("The model was not called");
  return call.prompt;
}

function userParts(prompt: Prompt): Array<{ type: string; text?: string }> {
  return prompt.flatMap((message) =>
    message.role === "user" ? message.content : [],
  );
}

describe("uploads for a model that reads only text", () => {
  it("gives a local model a PDF's text and names a file it cannot read", async () => {
    const parts = userParts(await promptFor("local:qwen3:30b-a3b"));

    expect(parts.map((part) => part.type)).toEqual(["text", "text", "text"]);
    const [, pdf, image] = parts;
    expect(pdf?.text).toContain('"distributed-systems-primer.pdf"');
    expect(pdf?.text).toContain("Distributed Systems Primer");
    expect(image?.text).toContain('"harbor.png"');
    expect(image?.text).toContain("image/png");
  });

  it("gives a cloud model the files themselves", async () => {
    const parts = userParts(await promptFor("openai:gpt-6-luna"));

    expect(parts.map((part) => part.type)).toEqual(["text", "file", "file"]);
  });
});

function textModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => ({
      content: [{ type: "text", text: "Done." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

/** A vision model that describes what it is shown, or fails. */
function visionModel(description: string | Error): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    modelId: "vision",
    doGenerate: async (): Promise<ModelResponse> => {
      if (description instanceof Error) throw description;
      return {
        content: [{ type: "text", text: description }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

async function turnsWithVision(
  vision: MockLanguageModelV3,
  turns: number,
): Promise<MockLanguageModelV3> {
  const model = textModel();
  const agent = createBrainAgentFactory({
    model,
    visionModel: vision,
    modelId: "local:qwen3:30b-a3b",
    messageBus: createMockMessageBus(),
  })({
    identity: {
      name: "Brain",
      role: "Researcher",
      purpose: "Help",
      values: [],
    },
    tools: [],
    getToolsForPermission: () => [],
  });
  for (const _turn of Array.from({ length: turns })) {
    await agent.generate({
      messages: [uploads],
      options: {
        conversationId: "conv-1",
        interfaceType: "web-chat",
        userPermissionLevel: "admin",
        isAnchor: true,
      },
    });
  }
  return model;
}

function imagePart(model: MockLanguageModelV3): string | undefined {
  const [call] = model.doGenerateCalls;
  if (!call) throw new Error("The model was not called");
  return userParts(call.prompt).find((part) =>
    part.text?.includes("harbor.png"),
  )?.text;
}

describe("images for a local model with a vision model", () => {
  it("gives the model the vision model's description of the image", async () => {
    const vision = visionModel("A harbor at dawn, with two fishing boats.");

    const model = await turnsWithVision(vision, 1);

    expect(imagePart(model)).toContain(
      "It shows: A harbor at dawn, with two fishing boats.",
    );
    const [described] = vision.doGenerateCalls;
    const shown = userParts(described?.prompt ?? []);
    expect(shown.some((part) => part.type === "file")).toBe(true);
  });

  it("describes each image once", async () => {
    const vision = visionModel("A harbor at dawn.");

    await turnsWithVision(vision, 2);

    expect(vision.doGenerateCalls).toHaveLength(1);
  });

  it("names the image without a description when the vision model fails", async () => {
    const model = await turnsWithVision(
      visionModel(new Error("runtime down")),
      1,
    );

    expect(imagePart(model)).toContain("Its contents are not shown to you.");
  });
});
