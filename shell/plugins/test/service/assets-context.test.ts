import { describe, expect, test } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import {
  createAssetRef,
  defaultPluginAssetMaxBytes,
  type AssetPutStreamOptions,
  type AssetRecord,
  type AssetStore,
} from "../../src";
import { createServicePluginContext } from "../../src/service/context";

const digest = "c".repeat(64);

function createRecordingStore(): {
  store: AssetStore;
  calls: AssetPutStreamOptions[];
} {
  const calls: AssetPutStreamOptions[] = [];
  const store: AssetStore = {
    put: async (): Promise<AssetRecord> => {
      throw new Error("namespace must route writes through putStream");
    },
    putStream: async (
      chunks: AsyncIterable<Uint8Array>,
      options: AssetPutStreamOptions = {},
    ): Promise<AssetRecord> => {
      calls.push(options);
      let sizeBytes = 0;
      for await (const chunk of chunks) sizeBytes += chunk.byteLength;
      return { ref: createAssetRef(digest), digest, sizeBytes };
    },
    read: async (): Promise<Uint8Array> => new Uint8Array([1, 2, 3]),
    stat: async () => null,
    verify: async () => {
      throw new Error("not used");
    },
  };
  return { store, calls };
}

describe("plugin asset context", () => {
  test("exposes a bounded namespace, not the shell-owned store", () => {
    const { store } = createRecordingStore();
    const shell = createMockShell({
      dataDir: "/tmp/git-sync-content",
      assetStore: store,
    });

    const context = createServicePluginContext(shell, "asset-test");

    expect(context.assets).not.toBe(store);
    expect(context.dataDir).toBe("/tmp/git-sync-content");
  });

  test("applies the default byte ceiling to plugin writes", async () => {
    const { store, calls } = createRecordingStore();
    const shell = createMockShell({ assetStore: store });
    const context = createServicePluginContext(shell, "asset-test");

    const record = await context.assets.put(new Uint8Array([1, 2, 3, 4]));

    expect(record.sizeBytes).toBe(4);
    expect(calls[0]?.maxBytes).toBe(defaultPluginAssetMaxBytes);
    expect(calls[0]?.expectedSize).toBe(4);
  });

  test("does not let callers override the buffered payload size", async () => {
    const { store, calls } = createRecordingStore();
    const shell = createMockShell({ assetStore: store });
    const context = createServicePluginContext(shell, "asset-test");

    await context.assets.put(new Uint8Array([1, 2, 3, 4]), {
      expectedSize: 1,
    });

    expect(calls[0]?.expectedSize).toBe(4);
  });

  test("lets a caller raise the ceiling explicitly", async () => {
    const { store, calls } = createRecordingStore();
    const shell = createMockShell({ assetStore: store });
    const context = createServicePluginContext(shell, "asset-test");

    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1, 2]);
    }
    await context.assets.putStream(chunks(), {
      maxBytes: defaultPluginAssetMaxBytes * 4,
    });

    expect(calls[0]?.maxBytes).toBe(defaultPluginAssetMaxBytes * 4);
  });

  test("delegates reads to the shell-owned store", async () => {
    const { store } = createRecordingStore();
    const shell = createMockShell({ assetStore: store });
    const context = createServicePluginContext(shell, "asset-test");

    expect(await context.assets.read(createAssetRef(digest))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(await context.assets.stat(createAssetRef(digest))).toBeNull();
  });
});
