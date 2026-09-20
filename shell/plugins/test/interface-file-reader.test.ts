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
import { createMessageInterfacePluginContext } from "../src/interface/context";
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

test("interface transports bind only transport methods and observe late provisioning without changing owner identity", async () => {
  const shell = createMockShell();
  const context = createMessageInterfacePluginContext(shell, "chat");
  expectTypeOf<keyof NonNullable<typeof context.fileTransfers>>().toEqualTypeOf<
    "putHttp" | "postHttp" | "withCapturedFile"
  >();
  expect(context.fileTransfers).toBeUndefined();
  const files = provision(unexpected);
  const caller = new AbortController();
  const options = { signal: caller.signal };
  const request = {
    sourceFile: file.sourceFile,
    facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
    url: "http://127.0.0.1/upload",
    headers: {},
  };
  const receipt = { ...request.facts, statusCode: 200 };
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  files.postHttp = async function (
    this: EntityFileAssets,
    input,
    receivedOptions,
  ): Promise<typeof receipt> {
    expect(this).toBe(files);
    expect(input).toBe(request);
    expect(receivedOptions).toBe(options);
    entered.resolve();
    await release.promise;
    return receipt;
  };
  shell.getEntityService().fileAssets = files;
  const send = context.fileTransfers?.postHttp;
  assert.ok(send);
  let settled = false;
  const work = send(request, options).finally(() => {
    settled = true;
  });
  try {
    await Promise.race([entered.promise, work]);
    caller.abort(new Error("late cancellation"));
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await work).toBe(receipt);
  const failure = new Error("remote outcome unknown");
  files.putHttp = async (): Promise<never> => {
    throw failure;
  };
  const put = context.fileTransfers.putHttp;
  assert.ok(put);
  await assert.rejects(put(request), (error: unknown) => error === failure);
});

test("interface capture binding borrows through the existing runtime with no publication authority", async () => {
  const shell = createMockShell();
  const context = createMessageInterfacePluginContext(shell, "chat");
  const files = provision(unexpected);
  const input = {
    url: "http://127.0.0.1/file",
    authorization: "Bearer fixture",
    maxBytes: 7,
  };
  const options = { signal: new AbortController().signal };
  const owner = new AbortController();
  const capture: NonNullable<EntityFileAssets["withCapturedFile"]> = async (
    received,
    use,
    receivedOptions,
  ) => {
    expect(received).toBe(input);
    expect(receivedOptions).toBe(options);
    return use(
      { ...file, details: { mediaType: "application/pdf" } },
      owner.signal,
    );
  };
  files.withCapturedFile = capture;
  shell.getEntityService().fileAssets = files;
  const bound = context.fileTransfers?.withCapturedFile;
  assert.ok(bound);
  const result = { id: "retained" };
  expect(
    await bound(
      input,
      async (source, signal) => {
        expect(source.sourceFile).toBe(file.sourceFile);
        expect(signal).toBe(owner.signal);
        return result;
      },
      options,
    ),
  ).toBe(result);
  const primary = new Error("retention failed");
  await assert.rejects(
    bound(
      input,
      async () => {
        throw primary;
      },
      options,
    ),
    (error: unknown) => error === primary,
  );
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
