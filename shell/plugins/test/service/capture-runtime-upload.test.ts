import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import type {
  EntityFileAssets,
  EntityCapturedFileSource,
} from "@brains/entity-service";
import { captureRuntimeUpload } from "../../src/service/capture-runtime-upload";
import {
  AcknowledgedRuntimeUploadError,
  type RuntimeUploadRecord,
} from "../../src/service/upload-registry";

const record: RuntimeUploadRecord = {
  id: "upload-00000000-0000-4000-8000-000000000001",
  ref: { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000001" },
  filename: "file.pdf",
  mediaType: "application/pdf",
  sizeBytes: 7,
  createdAt: "2026-05-30T00:00:00.000Z",
};
const file: EntityCapturedFileSource = {
  sourceFile: "/owned/source",
  sizeBytes: 7,
  sha256: "a".repeat(64),
  details: { mediaType: "application/octet-stream" },
};
const input = {
  source: {
    url: "http://127.0.0.1/file",
    authorization: "Bearer fixture",
    maxBytes: 7,
  },
  filename: "file.pdf",
  mediaType: "application/pdf",
};
type Capture = NonNullable<EntityFileAssets["withCapturedFile"]>;

test("capture validates inside the borrowed signal before saving and observes cancellation after validation", async () => {
  const owner = new AbortController();
  const failure = new Error("owner cancelled during validation");
  const saveFile = mock(async () => record);
  const capture: Capture = async (_source, use) => use(file, owner.signal);
  const validateFile = mock(
    async (
      received: EntityCapturedFileSource,
      signal: AbortSignal,
    ): Promise<void> => {
      expect(received).toBe(file);
      expect(signal).toBe(owner.signal);
      owner.abort(failure);
    },
  );
  await assert.rejects(
    captureRuntimeUpload(
      input,
      { withCapturedFile: capture },
      { saveFile },
      { validateFile },
    ),
    (error: unknown) => error === failure,
  );
  expect(validateFile).toHaveBeenCalledTimes(1);
  expect(saveFile).not.toHaveBeenCalled();
});

test("capture preserves distinct validation and provider retirement failures without saving", async () => {
  const primary = new Error("signature mismatch");
  const cleanup = new Error("capture retirement failed");
  const saveFile = mock(async () => record);
  const capture: Capture = async (_source, use) => {
    // A faulty provider masks its consumer's error; the guard must retain both.
    return use(file, new AbortController().signal).then(
      (): never => {
        throw cleanup;
      },
      (): never => {
        throw cleanup;
      },
    );
  };
  await assert.rejects(
    captureRuntimeUpload(
      input,
      { withCapturedFile: capture },
      { saveFile },
      {
        validateFile: async (): Promise<never> => {
          throw primary;
        },
      },
    ),
    (error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      if (!(error instanceof AggregateError)) return false;
      expect(error.errors).toContain(primary);
      expect(error.errors).toContain(cleanup);
      return true;
    },
  );
  expect(saveFile).not.toHaveBeenCalled();
});

test("capture retains metadata inside its loan and returns the exact saved outcome", async () => {
  let active = false;
  const signal = new AbortController().signal;
  const capture: Capture = async (source, use, options) => {
    expect(source).toEqual(input.source);
    expect(options?.signal).toBe(signal);
    active = true;
    try {
      return await use(file, signal);
    } finally {
      active = false;
    }
  };
  const saveFile = mock(async () => {
    expect(active).toBe(true);
    return record;
  });
  expect(
    await captureRuntimeUpload(
      input,
      { withCapturedFile: capture },
      { saveFile },
      { signal },
    ),
  ).toBe(record);
  expect(saveFile).toHaveBeenCalledWith({
    sourceFile: file.sourceFile,
    sizeBytes: file.sizeBytes,
    filename: input.filename,
    mediaType: input.mediaType,
  });
  expect(active).toBe(false);
});

test("capture preserves a known upload after source retirement fails", async () => {
  const failure = new Error("source retirement failed");
  const capture: Capture = async (_input, use) => {
    await use(file, new AbortController().signal);
    throw failure;
  };
  const saveFile = mock(async () => record);
  await assert.rejects(
    captureRuntimeUpload(input, { withCapturedFile: capture }, { saveFile }),
    (error: unknown) => {
      assert.ok(error instanceof AcknowledgedRuntimeUploadError);
      expect(error.record).toBe(record);
      expect(error.cause).toBe(failure);
      return true;
    },
  );
  expect(saveFile).toHaveBeenCalledTimes(1);
});

test.each(["duplicate", "wrong-outcome"] as const)(
  "capture rejects %s without replaying a saved upload",
  async (kind) => {
    const capture: Capture = async (_input, use) => {
      const result = await use(file, new AbortController().signal);
      if (kind === "duplicate") return use(file, new AbortController().signal);
      return structuredClone(result);
    };
    const saveFile = mock(async () => record);
    await assert.rejects(
      captureRuntimeUpload(input, { withCapturedFile: capture }, { saveFile }),
      (error: unknown) => {
        assert.ok(error instanceof AcknowledgedRuntimeUploadError);
        expect(error.record).toBe(record);
        assert.ok(error.cause instanceof Error);
        expect(error.cause.message).toBe(
          kind === "duplicate"
            ? "Upload capture consumer is closed or already entered"
            : "Upload capture did not return its consumer outcome",
        );
        return true;
      },
    );
    expect(saveFile).toHaveBeenCalledTimes(1);
  },
);

test("capture joins an unawaited save after provider failure and preserves both errors", async () => {
  const release = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const provider = new Error("provider failed");
  const retention = new Error("retention failed");
  let settled = false;
  const capture: Capture = async (_input, use) => {
    void use(file, new AbortController().signal);
    throw provider;
  };
  const saveFile = mock(async (): Promise<never> => {
    entered.resolve();
    await release.promise;
    throw retention;
  });
  const work = captureRuntimeUpload(
    input,
    { withCapturedFile: capture },
    { saveFile },
  ).finally(() => {
    settled = true;
  });
  const checked = assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    expect(error.errors).toEqual([provider, retention]);
    expect(error.cause).toBe(provider);
    return true;
  });
  try {
    await entered.promise;
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  await checked;
  expect(saveFile).toHaveBeenCalledTimes(1);
});

test("capture preserves an acknowledged store fault rather than retrying it", async () => {
  const failure = new AcknowledgedRuntimeUploadError(
    record,
    new Error("store cleanup failed"),
  );
  const capture: Capture = async (_input, use) =>
    use(file, new AbortController().signal);
  const saveFile = mock(async (): Promise<never> => {
    throw failure;
  });
  await assert.rejects(
    captureRuntimeUpload(input, { withCapturedFile: capture }, { saveFile }),
    (error: unknown) => error === failure,
  );
  expect(saveFile).toHaveBeenCalledTimes(1);
});

test("capture closes escaped consumers and validates descriptions before ingress", async () => {
  const failure = new Error("capture failed before entry");
  let escaped: (() => Promise<unknown>) | undefined;
  let calls = 0;
  const capture: Capture = async (_input, use) => {
    calls++;
    escaped = (): Promise<unknown> => use(file, new AbortController().signal);
    throw failure;
  };
  const saveFile = mock(async () => record);
  await assert.rejects(
    captureRuntimeUpload(
      { ...input, filename: "x".repeat(256) },
      { withCapturedFile: capture },
      { saveFile },
    ),
  );
  await assert.rejects(
    captureRuntimeUpload(
      { ...input, metadata: { oversized: "x".repeat(16384) } },
      { withCapturedFile: capture },
      { saveFile },
    ),
    /metadata exceeds/,
  );
  expect(calls).toBe(0);
  await assert.rejects(
    captureRuntimeUpload(input, { withCapturedFile: capture }, { saveFile }),
    (error: unknown) => error === failure,
  );
  assert.ok(escaped);
  await assert.rejects(escaped(), /closed/);
  expect(saveFile).not.toHaveBeenCalled();
});

test("capture has no buffered fallback or save after cancellation", async () => {
  const saveFile = mock(async () => record);
  await assert.rejects(
    captureRuntimeUpload(input, {}, { saveFile }),
    /not provisioned/,
  );
  const primary = new Error("cancelled before retention");
  const caller = new AbortController();
  caller.abort(primary);
  const capture: Capture = async (_input, use) => use(file, caller.signal);
  await assert.rejects(
    captureRuntimeUpload(input, { withCapturedFile: capture }, { saveFile }),
    (error: unknown) => error === primary,
  );
  expect(saveFile).not.toHaveBeenCalled();
});
