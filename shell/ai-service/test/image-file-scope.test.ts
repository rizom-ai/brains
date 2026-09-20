import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import type {
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import { withGeneratedImageFile } from "../src/image-generation";
import { createImageGenerationRequest } from "../src/image-generation-request";

const file: EntityVerifiedFileSource = {
  sourceFile: "/owned/generated",
  sizeBytes: 70,
  sha256: "a".repeat(64),
};
type Produce = NonNullable<EntityFileAssets["withProducedFile"]>;

test("image generation passes only bounded control metadata and awaits the file consumer", async () => {
  const caller = new AbortController();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let settled = false;
  const produce: Produce = async (directory, use, options) => {
    expect(directory).toBeUndefined();
    expect(options).toEqual({
      producer: "ai-image",
      metadata: {
        provider: "google",
        model: "gemini-image",
        apiKey: "image-key",
        prompt: "A subject",
        aspectRatio: "4:3",
      },
      signal: caller.signal,
    });
    return use(file, caller.signal);
  };
  const result = { acknowledged: true };
  const work = withGeneratedImageFile(
    "A subject",
    {
      imageModel: "google:gemini-image",
      apiKey: "text-key",
      imageApiKey: "image-key",
    },
    { getFiles: () => ({ withProducedFile: produce }) },
    async (source, signal) => {
      expect(source).toBe(file);
      expect(signal).toBe(caller.signal);
      entered.resolve();
      await release.promise;
      return result;
    },
    { aspectRatio: "4:3", signal: caller.signal },
  ).finally(() => {
    settled = true;
  });
  try {
    await entered.promise;
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await work).toBe(result);
});

test("image production has no SDK-buffer fallback and rejects pre-abort or invalid control metadata", async () => {
  let entered = 0;
  const consume = async (): Promise<void> => {
    entered++;
  };
  await assert.rejects(
    withGeneratedImageFile("A subject", { apiKey: "key" }, undefined, consume),
    /not provisioned/,
  );
  await assert.rejects(
    withGeneratedImageFile("A subject", {}, undefined, consume),
    /no API key/,
  );
  const caller = new AbortController();
  const failure = new Error("cancelled");
  caller.abort(failure);
  await assert.rejects(
    withGeneratedImageFile("A subject", { apiKey: "key" }, undefined, consume, {
      signal: caller.signal,
    }),
    (error: unknown) => error === failure,
  );
  assert.throws(() =>
    createImageGenerationRequest("x".repeat(16385), { apiKey: "key" }),
  );
  assert.throws(() =>
    createImageGenerationRequest("prompt", { apiKey: "key\nheader" }),
  );
  assert.throws(() =>
    createImageGenerationRequest("prompt", {
      apiKey: "key",
      imageModel: "unsupported:model",
    }),
  );
  expect(entered).toBe(0);
});

test("image request selection preserves existing provider key precedence without retaining unrelated credentials", () => {
  const request = createImageGenerationRequest("prompt", {
    model: "openai:gpt-5",
    imageModel: "gpt-image-1.5",
    apiKey: "text-key",
    imageApiKey: "image-key",
  });
  expect(request).toEqual({
    prompt: "prompt",
    provider: "openai",
    model: "gpt-image-1.5",
    apiKey: "text-key",
    aspectRatio: "16:9",
  });
  expect(
    createImageGenerationRequest("prompt", {
      model: "anthropic:claude",
      imageModel: "gpt-image-1.5",
      apiKey: "text-key",
      imageApiKey: "image-key",
    }).apiKey,
  ).toBe("image-key");
});
