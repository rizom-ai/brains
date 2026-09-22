import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import { streamText, tool } from "ai";
import { z } from "@brains/utils/zod";
import type { EntityFileAssets } from "@brains/entity-service";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import {
  AcknowledgedFileModelError,
  createFileModel,
  fileModelReference,
  type FileModelDependencies,
} from "../src/file-model";
import type { FileModelPart } from "../src/file-model-result";
import { ReceivedFileModelResponseError } from "../src/file-model-relay";
import type { FileModelCall } from "../src/file-model-request";

const reference = fileModelReference({ kind: "upload", id: "fixture" });
const call: FileModelCall = {
  prompt: [
    {
      role: "user",
      content: [
        {
          type: "file",
          filename: "source.pdf",
          mediaType: "application/pdf",
          data: reference,
        },
      ],
    },
  ],
};

test.each([false, true])(
  "streamed text remains live, terminal/tool events await source retirement; failure=%s",
  async (failRetirement) => {
    const fixture = await setup();
    const retirement = new Error("Source retirement failed");
    let held = false;
    const dependencies: FileModelDependencies = {
      ...fixture.dependencies,
      withFiles: async (references, signal, use) => {
        held = true;
        try {
          const output = await fixture.dependencies.withFiles(
            references,
            signal,
            use,
          );
          if (failRetirement) throw retirement;
          return output;
        } finally {
          held = false;
        }
      },
    };
    const model = createFileModel(
      new MockLanguageModelV3(),
      { model: "fixture" },
      dependencies,
    );
    try {
      const result = await model.doStream(call);
      const pid = Number(result.response?.headers?.["x-native-pid"]);
      expect(pid).not.toBe(process.pid);
      const reader = result.stream.getReader();
      const parts: FileModelPart[] = [];
      const consume = async (): Promise<void> => {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          parts.push(item.value);
          if (
            item.value.type.startsWith("tool-") ||
            item.value.type === "finish"
          )
            expect(held).toBe(false);
        }
      };
      if (failRetirement) {
        await assert.rejects(
          consume(),
          (error: unknown) =>
            error instanceof AcknowledgedFileModelError &&
            error.cause === retirement &&
            error.output.tail.some((part) => part.type === "tool-call"),
        );
        expect(
          parts.some(
            (part) => part.type === "finish" || part.type.startsWith("tool-"),
          ),
        ).toBe(false);
      } else {
        await consume();
        expect(parts.map((part) => part.type)).toEqual([
          "text-start",
          "text-delta",
          "text-end",
          "tool-input-start",
          "tool-input-delta",
          "tool-input-end",
          "tool-call",
          "finish",
        ]);
      }
      expect(parts.some((part) => part.type === "text-delta")).toBe(true);
      reader.releaseLock();
      expect(fixture.owner.stats().children).toBe(0);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally {
      await fixture.close();
    }
  },
);

test("producer retirement preserves received output without releasing tool calls", async () => {
  const fixture = await setup();
  const retirement = new Error("Producer retirement failed");
  const original = fixture.dependencies.getFiles()?.withProducedFile;
  if (!original) throw new Error("Missing fixture producer");
  const produce: NonNullable<EntityFileAssets["withProducedFile"]> = async (
    source,
    use,
    options,
  ) => {
    await original(source, use, options);
    throw retirement;
  };
  const model = createFileModel(
    new MockLanguageModelV3(),
    { model: "fixture" },
    {
      ...fixture.dependencies,
      getFiles: () => ({ withProducedFile: produce }),
    },
  );
  try {
    const result = await model.doStream(call);
    const reader = result.stream.getReader();
    const parts: FileModelPart[] = [];
    await assert.rejects(
      async () => {
        for (;;) {
          const item = await reader.read();
          if (item.done) return;
          parts.push(item.value);
        }
      },
      (error: unknown) =>
        error instanceof ReceivedFileModelResponseError &&
        error.cause === retirement &&
        error.output.tail.some((part) => part.type === "tool-call"),
    );
    expect(
      parts.some(
        (part) => part.type.startsWith("tool-") || part.type === "finish",
      ),
    ).toBe(false);
    expect(fixture.owner.stats().children).toBe(0);
    reader.releaseLock();
  } finally {
    await fixture.close();
  }
});

test("consumer cancellation joins actual native exit and its borrowed source", async () => {
  const fixture = await setup();
  let held = false;
  const model = createFileModel(
    new MockLanguageModelV3(),
    { model: "blocking" },
    {
      ...fixture.dependencies,
      withFiles: async (references, signal, use) => {
        held = true;
        try {
          return await fixture.dependencies.withFiles(references, signal, use);
        } finally {
          held = false;
        }
      },
    },
  );
  try {
    const result = await model.doStream(call);
    const reader = result.stream.getReader();
    expect((await reader.read()).value?.type).toBe("text-start");
    expect(held).toBe(true);
    await assert.rejects(reader.cancel(new Error("consumer cancelled")));
    reader.releaseLock();
    expect(held).toBe(false);
    expect(fixture.owner.stats().children).toBe(0);
  } finally {
    await fixture.close();
  }
});

test("the SDK keeps upload URLs opaque and executes tools only after source retirement", async () => {
  const fixture = await setup();
  let held = false;
  let executed = 0;
  const model = createFileModel(
    new MockLanguageModelV3(),
    { model: "fixture" },
    {
      ...fixture.dependencies,
      withFiles: async (references, signal, use) => {
        held = true;
        try {
          return await fixture.dependencies.withFiles(references, signal, use);
        } finally {
          held = false;
        }
      },
    },
  );
  try {
    const response = streamText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              filename: "source.pdf",
              mediaType: "application/pdf",
              data: reference,
            },
          ],
        },
      ],
      experimental_download: async (requests) => {
        expect(requests.every((request) => request.isUrlSupportedByModel)).toBe(
          true,
        );
        return requests.map(() => null);
      },
      tools: {
        system_create: tool({
          inputSchema: z.object({}),
          onInputStart: () => {
            expect(held).toBe(false);
          },
          execute: async () => {
            expect(held).toBe(false);
            executed++;
            return { saved: true };
          },
        }),
      },
    });
    expect(await response.text).toBe("Native stream");
    expect(await response.toolResults).toHaveLength(1);
    expect(executed).toBe(1);
    expect(fixture.owner.stats().children).toBe(0);
  } finally {
    await fixture.close();
  }
});

test("the SDK cannot download bare HTTP file inputs into the controller", async () => {
  const model = createFileModel(
    new MockLanguageModelV3(),
    { model: "fixture" },
    {
      getFiles: () => undefined,
      withFiles: async (): Promise<never> => {
        throw new Error("Unexpected file admission");
      },
    },
  );
  const response = streamText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: new URL("http://127.0.0.1:1/unretained.pdf"),
            mediaType: "application/pdf",
          },
        ],
      },
    ],
    experimental_download: async (requests) => {
      expect(requests.every((request) => request.isUrlSupportedByModel)).toBe(
        true,
      );
      return requests.map(() => null);
    },
    onError: () => {},
  });
  const errors: unknown[] = [];
  for await (const part of response.fullStream)
    if (part.type === "error") errors.push(part.error);
  expect(errors).toHaveLength(1);
  assert.ok(errors[0] instanceof Error);
  expect(errors[0].message).toContain("retained upload references");
});

test("missing provisioning and inline bytes never select the controller model", async () => {
  let entered = 0;
  const model = createFileModel(
    new MockLanguageModelV3({
      doGenerate: async (): Promise<never> => {
        entered++;
        throw new Error("Controller model entered");
      },
    }),
    { model: "fixture" },
    {
      getFiles: () => undefined,
      withFiles: async () => {
        throw new Error("Source entered before admission capability check");
      },
    },
  );
  await assert.rejects(
    Promise.resolve(model.doGenerate(call)),
    /not provisioned/,
  );
  await assert.rejects(
    Promise.resolve(
      model.doGenerate({
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "application/pdf",
                data: new Uint8Array([1]),
              },
            ],
          },
        ],
      }),
    ),
    /upload migration/,
  );
  expect(entered).toBe(0);
});

interface Fixture {
  dependencies: FileModelDependencies;
  owner: FileProcessOwner;
  close(): Promise<void>;
}
async function setup(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "file-model-scope-"));
  const sourceFile = join(directory, "source.pdf");
  const content = Buffer.from("%PDF-1.4\nNative scope fixture");
  await writeFile(sourceFile, content);
  const actor = new URL(
    "./fixtures/file-model-stream-actor.ts",
    import.meta.url,
  );
  const owner = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actor,
    downloadUrl: actor,
    producerUrls: { "file-model": actor },
  });
  const produce: NonNullable<EntityFileAssets["withProducedFile"]> = async (
    _source,
    use,
    options,
  ) => {
    const outputFile = join(directory, "receipt.json");
    const facts = await owner.produce(
      { sourceDirectory: directory, outputFile, metadata: options?.metadata },
      options?.signal,
      options?.producer,
    );
    return use(
      { sourceFile: outputFile, ...facts },
      options?.signal ?? new AbortController().signal,
    );
  };
  return {
    owner,
    dependencies: {
      getFiles: () => ({ withProducedFile: produce }),
      withFiles: async (references, signal, use): ReturnType<typeof use> => {
        signal.throwIfAborted();
        expect(references).toEqual([
          {
            reference: reference.href,
            source: { kind: "upload", id: "fixture" },
            filename: "source.pdf",
            mediaType: "application/pdf",
          },
        ]);
        return use([
          {
            reference: reference.href,
            sourceFile,
            sizeBytes: content.length,
            sha256: createHash("sha256").update(content).digest("hex"),
            filename: "source.pdf",
            mediaType: "application/pdf",
          },
        ]);
      },
    },
    close: async (): Promise<void> => {
      await owner.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
