import { expect, expectTypeOf, test } from "bun:test";
import assert from "node:assert/strict";
import type {
  EntityFileAssets,
  EntityFileReader,
  EntityVerifiedFileSource,
  EntityServiceClient,
  ICoreEntityService,
} from "@brains/entity-service";
import { createInterfacePluginContext, createMockShell } from "../test";
import type { InterfacePluginContext } from "../src/interface/context";

function unexpected(): never {
  throw new Error("Unexpected non-reader file operation");
}
function provision(
  withAssetFile: EntityFileReader["withAssetFile"],
): EntityFileAssets {
  return {
    withAssetFile,
    putHttp: unexpected,
    postHttp: unexpected,
    inspect: unexpected,
    fingerprint: unexpected,
    publish: unexpected,
    download: unexpected,
    close: unexpected,
  };
}
const ref = `asset://sha256/${"a".repeat(64)}` as const;
const file: EntityVerifiedFileSource = {
  sourceFile: "/owned/verified",
  sizeBytes: 7,
  sha256: "a".repeat(64),
};

test("interface file contracts expose only borrowing, without implicit provisioning", () => {
  expectTypeOf<
    NonNullable<ICoreEntityService["fileAssets"]>
  >().toEqualTypeOf<EntityFileReader>();
  expectTypeOf<
    keyof NonNullable<InterfacePluginContext["entityService"]["fileAssets"]>
  >().toEqualTypeOf<"withAssetFile">();
  expectTypeOf<EntityServiceClient["fileAssets"]>().toEqualTypeOf<
    EntityFileAssets | undefined
  >();
  const context = createInterfacePluginContext(createMockShell(), "chat");
  expect(context.entityService.fileAssets).toBeUndefined();
});

test("an existing interface context borrows through the provisioned owner until its consumer settles", async () => {
  const shell = createMockShell();
  const context = createInterfacePluginContext(shell, "chat");
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const owner = new AbortController();
  const options = { signal: caller.signal };
  let active = false;
  let calls = 0;
  const files = provision(async (requestedRef, use, receivedOptions) => {
    expect(requestedRef).toBe(ref);
    expect(receivedOptions).toBe(options);
    calls++;
    active = true;
    try {
      return await use(file, owner.signal);
    } finally {
      active = false;
    }
  });
  shell.getEntityService().fileAssets = files;
  const reader = context.entityService.fileAssets;
  assert.ok(reader);
  expect(reader).toBe(files);
  const result = { messageId: "acknowledged" };
  const pending = reader.withAssetFile(
    ref,
    async (receivedFile, signal) => {
      expect(receivedFile).toBe(file);
      expect(signal).toBe(owner.signal);
      entered.resolve();
      await release.promise;
      return result;
    },
    options,
  );
  expectTypeOf(pending).toEqualTypeOf<Promise<typeof result>>();
  try {
    await entered.promise;
    expect(active).toBe(true);
  } finally {
    release.resolve();
  }
  expect(await pending).toBe(result);
  expect(active).toBe(false);
  expect(calls).toBe(1);
});

test("interface loans propagate the exact consumer failure without replay", async () => {
  const shell = createMockShell();
  let calls = 0;
  shell.getEntityService().fileAssets = provision(async (_ref, use) => {
    calls++;
    return use(file, new AbortController().signal);
  });
  const context = createInterfacePluginContext(shell, "chat");
  const reader = context.entityService.fileAssets;
  assert.ok(reader);
  const primary = new Error("send failed after submission");
  await assert.rejects(
    reader.withAssetFile(ref, async () => {
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(calls).toBe(1);
});
