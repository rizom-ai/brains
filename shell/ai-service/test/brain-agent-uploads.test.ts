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

// A local model's runtime turns uploads into text (local-runtime-model.ts);
// the agent hands every model the files themselves, so none is turned twice.
describe("uploads", () => {
  it.each(["local:qwen3:30b-a3b", "openai:gpt-6-luna"])(
    "reach %s as the files themselves",
    async (modelId) => {
      const parts = userParts(await promptFor(modelId));

      expect(parts.map((part) => part.type)).toEqual(["text", "file", "file"]);
    },
  );
});
