import { MockLanguageModelV3 } from "ai/test";
import { runFileModelActor } from "../../src/file-model-actor";

// Inject only the provider: production source reading, relay and actor ownership run unchanged.
runFileModelActor(import.meta.url, {
  getModel: (config) =>
    new MockLanguageModelV3({
      doStream: async ({
        prompt,
      }): Promise<Awaited<ReturnType<MockLanguageModelV3["doStream"]>>> => {
        const source = prompt
          .flatMap((message) =>
            message.role === "user" ? message.content : [],
          )
          .find((part) => part.type === "file");
        if (source?.type !== "file" || !(source.data instanceof Uint8Array))
          throw new Error("Native fixture did not receive source bytes");
        return {
          get request(): never {
            throw new Error("SDK request diagnostic was read");
          },
          response: { headers: { "x-native-pid": String(process.pid) } },
          stream: new ReadableStream({
            start(controller): void {
              controller.enqueue({ type: "text-start", id: "text-1" });
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "Native stream",
              });
              if (config.model === "blocking") return;
              controller.enqueue({ type: "text-end", id: "text-1" });
              controller.enqueue({
                type: "tool-input-start",
                id: "call-1",
                toolName: "system_create",
              });
              controller.enqueue({
                type: "tool-input-delta",
                id: "call-1",
                delta: "{}",
              });
              controller.enqueue({ type: "tool-input-end", id: "call-1" });
              controller.enqueue({
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "system_create",
                input: "{}",
              });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 3, text: 3, reasoning: undefined },
                },
              });
              controller.close();
            },
          }),
        };
      },
    }),
});
