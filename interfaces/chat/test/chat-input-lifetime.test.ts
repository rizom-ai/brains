import { expect, test, mock } from "bun:test";
import type { InterfacePluginContext } from "@brains/plugins";
import { ChatInputBuilder } from "../src/chat-input-builder";
import { createMessage, createThread } from "./harness/chat-interface-harness";

test("input shutdown cancels capture, joins retirement and rejects stale epochs", async () => {
  const entered = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const saveFile = mock(async (): Promise<never> => {
    throw new Error("Unexpected retention");
  });
  const unexpected = (): never => {
    throw new Error("Unexpected file operation");
  };
  const builder = new ChatInputBuilder({
    getUploadStore: (): { saveFile: typeof saveFile } => ({ saveFile }),
    getFileTransfers: (): NonNullable<
      InterfacePluginContext["fileTransfers"]
    > => ({
      withCapturedFile: async (_source, _use, options): Promise<never> => {
        const signal = options?.signal;
        if (!signal) throw new Error("Capture requires its input signal");
        signal.throwIfAborted();
        entered.resolve();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        retiring.resolve();
        await release.promise;
        throw signal.reason;
      },
      inspect: unexpected,
      putHttp: unexpected,
      postHttp: unexpected,
    }),
    getDownloadSource: (): { url: string } => ({
      url: "http://127.0.0.1/source",
    }),
    getThreadIdParts: (): Record<string, never> => ({}),
    logger: { error: mock(() => {}) },
  });
  const oldSignal = builder.signal;
  const thread = createThread();
  const message = createMessage({
    attachments: [{ name: "file.txt", mimeType: "text/plain" }],
  });
  const result = builder.build("discord", thread, message, "trusted").then(
    () => {
      throw new Error("Unexpected completed input");
    },
    (error: unknown) => error,
  );
  await entered.promise;
  const state = { stopped: false };
  const stopping = builder.stop().then(() => {
    state.stopped = true;
  });
  await retiring.promise;
  expect(state.stopped).toBe(false);
  expect(saveFile).not.toHaveBeenCalled();
  release.resolve();
  await stopping;
  expect(await result).toBe(oldSignal.reason);
  expect(state.stopped).toBe(true);
  expect(() => builder.build("discord", thread, message, "trusted")).toThrow(
    "Chat input stopped",
  );
  builder.start();
  expect(() =>
    builder.build("discord", thread, message, "trusted", oldSignal),
  ).toThrow("Chat input stopped");
  expect(
    (
      await builder.build(
        "discord",
        thread,
        createMessage({ text: "Fresh epoch" }),
        "trusted",
      )
    ).message,
  ).toBe("Fresh epoch");
  await builder.stop();
});
