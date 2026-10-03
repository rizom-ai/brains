import { describe, expect, test } from "bun:test";
import { createAssetRef, readAssetBytes, type AssetRef } from "../src";

describe("readAssetBytes", () => {
  test("concatenates the opened chunks in order", async () => {
    const ref = createAssetRef("a".repeat(64));
    const opened: AssetRef[] = [];

    const bytes = await readAssetBytes(
      {
        openAsset: async (asset) => {
          opened.push(asset);
          return (async function* (): AsyncGenerator<Uint8Array> {
            yield Uint8Array.of(1, 2);
            yield Uint8Array.of(3);
          })();
        },
      },
      ref,
    );

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(opened).toEqual([ref]);
  });
});
