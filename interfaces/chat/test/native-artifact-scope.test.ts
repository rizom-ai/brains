import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { prepareAsset } from "@brains/assets";
import {
  createMockShell,
  createInterfacePluginContext,
} from "@brains/plugins/test";
import type { StructuredChatCard } from "@brains/plugins";
import {
  ArtifactDeliveryResolver,
  type ArtifactDelivery,
} from "../src/artifact-delivery";
import { AcknowledgedFileDeliveryError } from "../src/file-delivery";

interface Fixture {
  resolver: ArtifactDeliveryResolver;
  cards: StructuredChatCard[];
  state: { active: number; loans: number; cleanupError?: Error };
}
function unexpected(): never {
  throw new Error("Unexpected buffered operation");
}
async function fixture(): Promise<Fixture> {
  const shell = createMockShell();
  const context = createInterfacePluginContext(shell, "chat");
  const service = shell.getEntityService();
  const assets = [0, 1, 2].map((id) =>
    prepareAsset(new TextEncoder().encode(`image-${id}`)),
  );
  const cards: StructuredChatCard[] = [];
  for (const [index, asset] of assets.entries()) {
    const id = `image-${index}`;
    await service.createEntity({
      entity: {
        id,
        entityType: "image",
        content: asset.ref,
        visibility: "shared",
        metadata: { mediaType: "image/png" },
      },
      preparedAsset: asset,
    });
    cards.push({
      kind: "attachment",
      id,
      title: id,
      attachment: {
        mediaType: "image/png",
        url: `/api/chat/attachments/image?id=${id}`,
      },
    });
  }
  service.readAsset = unexpected;
  const state: Fixture["state"] = { active: 0, loans: 0 };
  const files: NonNullable<typeof service.fileAssets> = {
    withAssetFile: async (ref, use, options) => {
      const asset = assets.find((item) => item.ref === ref);
      assert.ok(asset);
      state.loans++;
      state.active++;
      try {
        const result = await use(
          {
            sourceFile: "/owned/image",
            sizeBytes: asset.sizeBytes,
            sha256: asset.digest,
          },
          options?.signal ?? new AbortController().signal,
        );
        if (state.cleanupError) throw state.cleanupError;
        return result;
      } finally {
        state.active--;
      }
    },
    postHttp: unexpected,
    putHttp: unexpected,
    inspect: unexpected,
    fingerprint: unexpected,
    publish: unexpected,
    download: unexpected,
    close: async (): Promise<void> => undefined,
  };
  service.fileAssets = files;
  return {
    resolver: new ArtifactDeliveryResolver({
      getContext: () => context,
      getDisplayBaseUrl: () => undefined,
      logger: { debug: unexpected },
    }),
    cards,
    state,
  };
}

test("serial native sends retain acknowledged cards and stop after uncertainty without replay", async () => {
  const { resolver, cards, state } = await fixture();
  let scope: ArtifactDelivery | undefined;
  const attempts: string[] = [];
  const failure = new Error("second outcome unknown");
  const deliver = mock(async () => {
    expect(state.active).toBe(1);
    if (state.loans === 2) throw failure;
    return { id: "ack" };
  });
  await assert.rejects(
    resolver.withFiles(
      cards,
      "trusted",
      async (delivery) => {
        scope = delivery;
        expect(delivery.files).toEqual([]);
        assert.ok(delivery.sendFiles);
        await delivery.sendFiles((id) => {
          attempts.push(id);
        });
      },
      { deliver },
    ),
    (error: unknown) => error === failure,
  );
  expect(deliver).toHaveBeenCalledTimes(2);
  expect(attempts).toEqual(["image-0", "image-1"]);
  expect([...(scope?.deliveredCardIds ?? [])]).toEqual(["image-0"]);
  expect(state.active).toBe(0);
});

test("a scope joins an unawaited send, rejects reentry, and closes escaped send functions", async () => {
  const { resolver, cards, state } = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let send: ArtifactDelivery["sendFiles"];
  let settled = false;
  const value = { acknowledged: true };
  const work = resolver
    .withFiles(
      cards,
      "trusted",
      async (delivery) => {
        send = delivery.sendFiles;
        assert.ok(send);
        void send();
        await assert.rejects(send(), /already entered/);
        return value;
      },
      {
        deliver: async () => {
          expect(state.active).toBe(1);
          entered.resolve();
          await release.promise;
          return value;
        },
      },
    )
    .finally(() => {
      settled = true;
    });
  try {
    await Promise.race([entered.promise, work]);
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await work).toBe(value);
  expect(state.loans).toBe(3);
  expect(state.active).toBe(0);
  assert.ok(send);
  await assert.rejects(send(), /closed/);
  expect(state.loans).toBe(3);
});

test("consumer failure aborts future stages but joins the submitted send and preserves both errors", async () => {
  const { resolver, cards, state } = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const consumer = new Error("consumer failed");
  const transport = new Error("remote outcome unknown");
  let settled = false;
  const work = resolver
    .withFiles(
      cards,
      "trusted",
      async (delivery) => {
        assert.ok(delivery.sendFiles);
        void delivery.sendFiles();
        await entered.promise;
        throw consumer;
      },
      {
        deliver: async (_file, signal) => {
          entered.resolve();
          await release.promise;
          expect(signal.aborted).toBe(true);
          throw transport;
        },
      },
    )
    .finally(() => {
      settled = true;
    });
  const checked = assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    expect(error.cause).toBe(consumer);
    expect(error.errors).toEqual([consumer, transport]);
    return true;
  });
  try {
    await entered.promise;
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  await checked;
  expect(state.loans).toBe(1);
  expect(state.active).toBe(0);
});

test("a known receipt survives loan cleanup failure without sending the next artifact", async () => {
  const { resolver, cards, state } = await fixture();
  state.cleanupError = new Error("retain staged source");
  const receipt = { id: "shared" };
  let scope: ArtifactDelivery | undefined;
  await assert.rejects(
    resolver.withFiles(
      cards,
      "trusted",
      async (delivery) => {
        scope = delivery;
        assert.ok(delivery.sendFiles);
        await delivery.sendFiles();
      },
      { deliver: async () => receipt },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AcknowledgedFileDeliveryError);
      expect(error.receipt).toBe(receipt);
      expect(error.cause).toBe(state.cleanupError);
      return true;
    },
  );
  expect([...(scope?.deliveredCardIds ?? [])]).toEqual(["image-0"]);
  expect(state.loans).toBe(1);
  expect(state.active).toBe(0);
});
