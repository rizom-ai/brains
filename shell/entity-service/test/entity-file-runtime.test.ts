import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { EntityFileRuntime } from "../src/entity-file-runtime";
import { EntityBinaryClient } from "../src/entity-binary-client";
import {
  parseEntityBinaryControlRequest,
  type EntityBinaryControlRequest,
} from "../src/entity-binary-rpc";
const ticket = "00000000-0000-4000-8000-000000000001";
const input = { sourceFile: "/trusted/image.png", sizeBytes: 1 };
function runtime(
  control: (request: EntityBinaryControlRequest) => Promise<unknown>,
): EntityFileRuntime {
  const client = new EntityBinaryClient({
    transport: {
      control: (request, options): Promise<unknown> => {
        expect(options?.signal).toBeUndefined();
        return control(parseEntityBinaryControlRequest(request));
      },
      publication: async (): Promise<never> => {
        throw new Error("Unexpected publication");
      },
      invalidate: (): void => {
        throw new Error("Unexpected fence");
      },
    },
  });
  return new EntityFileRuntime(client, {
    executable: process.execPath,
    uploadUrl: new URL(
      "../../../shared/db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    downloadUrl: new URL(
      "../../../shared/db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
    inspectionUploadUrl: new URL(
      "../../../shared/image/src/file-inspection-process.ts",
      import.meta.url,
    ),
  });
}
test("file inspection validates trusted paths and sizes before acquiring authority", async () => {
  let calls = 0;
  const files = runtime(async (): Promise<never> => {
    calls++;
    throw new Error("Unexpected control");
  });
  try {
    await assert.rejects(
      files.inspect({ ...input, sourceFile: "relative.png" }),
    );
    await assert.rejects(
      files.inspect({ ...input, sourceFile: "/invalid\0.png" }),
    );
    await assert.rejects(
      files.inspect({ ...input, sizeBytes: 100 * 1024 * 1024 + 1 }),
    );
    expect(calls).toBe(0);
  } finally {
    await files.close();
  }
});
test("file runtime closes admission before asynchronous shutdown", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const closing = files.close();
  await assert.rejects(files.inspect(input), /closing/);
  expect(files.close()).toBe(closing);
  await closing;
});
test("shutdown observes a pending inspection offer and waits for acknowledged retirement", async () => {
  const offered = Promise.withResolvers<void>();
  const releaseOffer = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const releaseRetirement = Promise.withResolvers<void>();
  const files = runtime(async (request): Promise<unknown> => {
    if (request.operation === "offer") {
      offered.resolve();
      await releaseOffer.promise;
      return { ticket };
    }
    if (request.operation === "cancel") {
      expect(request.ticket).toBe(ticket);
      retiring.resolve();
      await releaseRetirement.promise;
      return null;
    }
    throw new Error("Inspection must not start after shutdown");
  });
  const inspection = files.inspect(input);
  const rejected = assert.rejects(inspection, /File runtime closed/);
  await offered.promise;
  let closed = false;
  const closing = files.close().finally(() => {
    closed = true;
  });
  const closeRejected = assert.rejects(closing, /cleanup failed/);
  releaseOffer.resolve();
  await retiring.promise;
  expect(closed).toBe(false);
  releaseRetirement.resolve();
  await Promise.all([rejected, closeRejected]);
  expect(closed).toBe(true);
});
