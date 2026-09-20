import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { createMockShell } from "@brains/plugins/test";
import type { AssetRef } from "@brains/assets";
import {
  deliverArtifactFile,
  AcknowledgedFileDeliveryError,
  type FileDeliveryAssets,
  type FileDeliveryRequest,
  type ArtifactDeliveryFile,
} from "../src/file-delivery";
import { createSlackFileDeliveryAdapter } from "../src/slack-file-delivery";
import { createSlackFileMetadataApi } from "../src/slack-file-api";
import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "../src/artifact-limits";

const ref: AssetRef = `asset://sha256/${"a".repeat(64)}`;
const request: FileDeliveryRequest = {
  entityRef: { entityType: "document", id: "source" },
  userLevel: "trusted",
};
interface FixtureState {
  active: boolean;
  retained: boolean;
  loans: number;
  cleanupError?: Error;
  source: Pick<ArtifactDeliveryFile, "sourceFile" | "sizeBytes" | "sha256">;
  stat: { ref: AssetRef; sizeBytes: number };
}
interface Fixture {
  assets: FileDeliveryAssets;
  state: FixtureState;
}
async function fixture(
  content: string = ref,
  status = "draft",
  visibility: "public" | "shared" = "shared",
  entityType: "document" | "image" = "document",
): Promise<Fixture> {
  const service = createMockShell().getEntityService();
  await service.createEntity({
    entity: {
      id: "source",
      entityType,
      content,
      visibility,
      metadata:
        entityType === "document"
          ? { mimeType: "application/pdf", filename: "source.pdf", status }
          : { mediaType: "image/png", filename: "source.png", status },
    },
  });
  const state: FixtureState = {
    active: false,
    retained: false,
    loans: 0,
    source: {
      sourceFile: "/borrowed/verified",
      sizeBytes: 4,
      sha256: "a".repeat(64),
    },
    stat: { ref, sizeBytes: 4 },
  };
  const assets: FileDeliveryAssets = {
    getEntity: service.getEntity.bind(service),
    statAsset: mock(async () => state.stat),
    fileAssets: {
      withAssetFile: async (requested, use, options) => {
        expect(requested).toBe(ref);
        state.loans++;
        state.active = true;
        try {
          const result = await use(
            state.source,
            options?.signal ?? new AbortController().signal,
          );
          if (state.cleanupError) throw state.cleanupError;
          return result;
        } catch (error) {
          state.retained = true;
          throw error;
        } finally {
          state.active = false;
        }
      },
    },
  };
  return { assets, state };
}

test("shared delivery keeps the loan through adapter settlement and preserves a late acknowledged result", async () => {
  const { assets, state } = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const receipt = { messageId: "message-1" };
  const deliver = mock(
    async (file: ArtifactDeliveryFile, signal: AbortSignal) => {
      expect(file).toEqual({
        ...state.source,
        filename: "override.pdf",
        mimeType: "application/pdf",
      });
      expect(signal).toBe(caller.signal);
      entered.resolve();
      await release.promise;
      expect(state.active).toBe(true);
      return receipt;
    },
  );
  const work = deliverArtifactFile(
    { ...request, filename: "override.pdf", signal: caller.signal },
    assets,
    { deliver },
  );
  try {
    await Promise.race([entered.promise, work]);
    caller.abort(new Error("late cancellation"));
    expect(state.active).toBe(true);
  } finally {
    release.resolve();
  }
  expect(await work).toEqual({ status: "delivered", receipt });
  expect(state.active).toBe(false);
  expect(state.loans).toBe(1);
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("Slack implements the same delivery contract without owning policy or the loan", async () => {
  const { assets, state } = await fixture();
  const target = { channelId: "C123" };
  const api = createSlackFileMetadataApi("xoxb-test", async (url) => {
    expect(state.active).toBe(true);
    return Response.json(
      url.endsWith("files.getUploadURLExternal")
        ? { ok: true, file_id: "F123", upload_url: "http://127.0.0.1/upload" }
        : { ok: true, files: [{ id: "F123" }] },
    );
  });
  const complete = mock(api.complete);
  const adapter = createSlackFileDeliveryAdapter(target, {
    ...api,
    postHttp: async (input) => ({ ...input.facts, statusCode: 200 }),
    complete,
  });
  target.channelId = "C456";
  expect(await deliverArtifactFile(request, assets, adapter)).toEqual({
    status: "delivered",
    receipt: { fileId: "F123" },
  });
  expect(complete).toHaveBeenCalledWith(
    { files: [{ id: "F123", title: "source.pdf" }], channel_id: "C123" },
    expect.any(AbortSignal),
  );
  expect(state.active).toBe(false);
});

test("image references use the same policy and file handoff contract", async () => {
  const { assets, state } = await fixture(ref, "draft", "shared", "image");
  const deliver = mock(async (file: ArtifactDeliveryFile) => {
    expect(file.mimeType).toBe("image/png");
    expect(file.filename).toBe("source.png");
    expect(state.active).toBe(true);
    return { messageId: "image-message" };
  });
  expect(
    await deliverArtifactFile(
      { ...request, entityRef: { entityType: "image", id: "source" } },
      assets,
      { deliver },
    ),
  ).toEqual({ status: "delivered", receipt: { messageId: "image-message" } });
  expect(state.loans).toBe(1);
  expect(state.active).toBe(false);
});

test("denied entities never acquire a stat, loan or adapter send", async () => {
  const { assets, state } = await fixture();
  const deliver = mock(async () => "unexpected");
  expect(
    await deliverArtifactFile({ ...request, userLevel: "public" }, assets, {
      deliver,
    }),
  ).toEqual({ status: "denied" });
  expect(assets.statAsset).not.toHaveBeenCalled();
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});

test("visible public artifacts keep link visibility without native sending", async () => {
  const { assets, state } = await fixture(ref, "draft", "public");
  const deliver = mock(async () => "unexpected");
  expect(
    await deliverArtifactFile({ ...request, userLevel: "public" }, assets, {
      deliver,
    }),
  ).toEqual({ status: "native-disabled" });
  expect(assets.statAsset).not.toHaveBeenCalled();
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});

test("missing entities and assets do not enter delivery", async () => {
  const { assets, state } = await fixture();
  const deliver = mock(async () => "unexpected");
  expect(
    await deliverArtifactFile(
      { ...request, entityRef: { entityType: "document", id: "absent" } },
      assets,
      { deliver },
    ),
  ).toEqual({ status: "missing" });
  assets.statAsset = async (): Promise<null> => null;
  expect(await deliverArtifactFile(request, assets, { deliver })).toEqual({
    status: "missing",
  });
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});

test("a loan cannot cause a second adapter send", async () => {
  const { assets, state } = await fixture();
  const reader = assets.fileAssets;
  assert.ok(reader);
  const duplicate: FileDeliveryAssets = {
    ...assets,
    fileAssets: {
      withAssetFile: (ref, use, options) =>
        reader.withAssetFile(
          ref,
          async (source, signal) => {
            await use(source, signal);
            return use(source, signal);
          },
          options,
        ),
    },
  };
  const deliver = mock(async () => "acknowledged");
  await assert.rejects(
    deliverArtifactFile(request, duplicate, { deliver }),
    (error: unknown) => {
      assert.ok(error instanceof AcknowledgedFileDeliveryError);
      expect(error.receipt).toBe("acknowledged");
      return true;
    },
  );
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(state.retained).toBe(true);
});

test.each(["pending", "generating", "failed", "error"])(
  "%s artifacts are not delivered",
  async (status) => {
    const { assets, state } = await fixture(ref, status);
    const deliver = mock(async () => "unexpected");
    expect(await deliverArtifactFile(request, assets, { deliver })).toEqual({
      status: "not-ready",
    });
    expect(state.loans).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
  },
);

test("inline content is unsupported, not a buffered fallback", async () => {
  const { assets, state } = await fixture(
    "data:application/pdf;base64,JVBERi0=",
  );
  const deliver = mock(async () => "unexpected");
  expect(await deliverArtifactFile(request, assets, { deliver })).toEqual({
    status: "unsupported",
  });
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});

test("oversized assets are rejected from authoritative stat before borrowing", async () => {
  const { assets, state } = await fixture();
  state.stat.sizeBytes = CHAT_NATIVE_ARTIFACT_MAX_BYTES + 1;
  const deliver = mock(async () => "unexpected");
  expect(await deliverArtifactFile(request, assets, { deliver })).toEqual({
    status: "too-large",
  });
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});

test("loan facts must match the reference and stat before the adapter is entered", async () => {
  for (const mismatch of [{ sizeBytes: 3 }, { sha256: "b".repeat(64) }]) {
    const { assets, state } = await fixture();
    Object.assign(state.source, mismatch);
    const deliver = mock(async () => "unexpected");
    await assert.rejects(
      deliverArtifactFile(request, assets, { deliver }),
      /does not match/,
    );
    expect(deliver).not.toHaveBeenCalled();
    expect(state.retained).toBe(true);
  }
});

test("adapter errors retain identity and staging without a second send", async () => {
  const { assets, state } = await fixture();
  const failure = new AggregateError([
    new Error("send uncertain"),
    new Error("retirement failed"),
  ]);
  const deliver = mock(async (): Promise<never> => {
    throw failure;
  });
  await assert.rejects(
    deliverArtifactFile(request, assets, { deliver }),
    (error: unknown) => error === failure,
  );
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(state.retained).toBe(true);
});

test("cleanup failures retain the acknowledged receipt and original cleanup cause", async () => {
  const { assets, state } = await fixture();
  state.cleanupError = new Error("cleanup failed");
  const receipt = { fileId: "F123" };
  const deliver = mock(async () => receipt);
  await assert.rejects(
    deliverArtifactFile(request, assets, { deliver }),
    (error: unknown) => {
      assert.ok(error instanceof AcknowledgedFileDeliveryError);
      expect(error.receipt).toBe(receipt);
      expect(error.cause).toBe(state.cleanupError);
      return true;
    },
  );
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(state.retained).toBe(true);
});

test("pre-abort and missing provisioning do not enter a loan or send", async () => {
  const { assets, state } = await fixture();
  const caller = new AbortController();
  const primary = new Error("cancelled");
  caller.abort(primary);
  const deliver = mock(async () => "unexpected");
  await assert.rejects(
    deliverArtifactFile({ ...request, signal: caller.signal }, assets, {
      deliver,
    }),
    (error: unknown) => error === primary,
  );
  const { fileAssets: _files, ...unprovisioned } = assets;
  await assert.rejects(
    deliverArtifactFile(request, unprovisioned, { deliver }),
    /not provisioned/,
  );
  expect(state.loans).toBe(0);
  expect(deliver).not.toHaveBeenCalled();
});
