import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { ReceivedEntityFileHttpError } from "@brains/plugins";
import {
  createDiscordFileDeliveryAdapter,
  ReceivedDiscordFileDeliveryError,
  type DiscordFileDeliveryDeps,
} from "../src/discord-file-delivery";
import type { ArtifactDeliveryFile } from "../src/file-delivery";

const file: ArtifactDeliveryFile = {
  sourceFile: "/owned/file",
  sizeBytes: 17,
  sha256: "a".repeat(64),
  filename: "picture.png",
  mimeType: "image/png",
};
const target = { channelId: "123456", botToken: "fixture-token" };
function receipt(): Awaited<ReturnType<DiscordFileDeliveryDeps["postHttp"]>> {
  return {
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    statusCode: 200,
    responseMetadata: {
      messageId: "987654",
      channelId: target.channelId,
      attachmentId: "56789",
      attachmentCount: 1,
      filename: file.filename,
      sizeBytes: file.sizeBytes,
    },
  };
}

test("Discord adapter binds routing and performs exactly one metadata-only multipart handoff", async () => {
  const routing = { ...target };
  const postHttp = mock(async () => receipt());
  const adapter = createDiscordFileDeliveryAdapter(routing, { postHttp });
  routing.channelId = "999";
  routing.botToken = "changed";
  const caller = new AbortController();
  expect(await adapter.deliver(file, caller.signal)).toEqual({
    messageId: "987654",
    channelId: "123456",
    attachmentId: "56789",
  });
  expect(postHttp).toHaveBeenCalledTimes(1);
  expect(postHttp).toHaveBeenCalledWith(
    {
      sourceFile: file.sourceFile,
      facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
      url: "https://discord.com/api/v10/channels/123456/messages",
      headers: { authorization: "Bot fixture-token" },
      multipart: {
        fieldName: "files[0]",
        filename: file.filename,
        mimeType: file.mimeType,
        fields: {
          payload_json: JSON.stringify({
            attachments: [{ id: 0, filename: file.filename }],
            allowed_mentions: { parse: [] },
          }),
        },
      },
      responseMetadata: {
        messageId: ["id"],
        channelId: ["channel_id"],
        attachmentId: ["attachments", 0, "id"],
        attachmentCount: ["attachments", "length"],
        filename: ["attachments", 0, "filename"],
        sizeBytes: ["attachments", 0, "size"],
      },
    },
    { signal: caller.signal },
  );
});

test("Discord pre-abort rejects without submission and late cancellation preserves an acknowledged message", async () => {
  const caller = new AbortController();
  const primary = new Error("cancelled");
  const postHttp = mock(async () => {
    caller.abort(primary);
    return receipt();
  });
  const adapter = createDiscordFileDeliveryAdapter(target, { postHttp });
  expect((await adapter.deliver(file, caller.signal)).messageId).toBe("987654");
  await assert.rejects(
    adapter.deliver(file, caller.signal),
    (error: unknown) => error === primary,
  );
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test("Discord retains only validated receipt IDs after native failure and late cancellation", async () => {
  const caller = new AbortController();
  const failure = new ReceivedEntityFileHttpError(
    receipt(),
    new Error("private native failure"),
  );
  const submitted = { ...file };
  const postHttp = mock(async (): Promise<never> => {
    caller.abort(new Error("late cancellation"));
    submitted.filename = "changed.png";
    submitted.sha256 = "b".repeat(64);
    throw failure;
  });
  await assert.rejects(
    createDiscordFileDeliveryAdapter(target, { postHttp }).deliver(
      submitted,
      caller.signal,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ReceivedDiscordFileDeliveryError);
      assert.equal(error.cause, failure);
      assert.deepEqual(error.receipt, {
        messageId: "987654",
        channelId: "123456",
        attachmentId: "56789",
      });
      assert.ok(Object.isFrozen(error.receipt));
      assert.ok(!JSON.stringify(error.receipt).includes("private"));
      assert.ok(!JSON.stringify(error.receipt).includes("fixture-token"));
      return true;
    },
  );
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test.each(["unbranded", "hostile"])(
  "Discord preserves %s failure identity instead of guessing receipts",
  async (kind) => {
    const error =
      kind === "unbranded"
        ? Object.assign(new Error("opaque"), { outcome: receipt() })
        : new ReceivedEntityFileHttpError(receipt(), new Error("retirement"));
    if (kind === "hostile")
      Object.defineProperty(error, "outcome", {
        get: (): never => {
          throw new Error("private getter");
        },
      });
    const postHttp = mock(async (): Promise<never> => {
      throw error;
    });
    await assert.rejects(
      createDiscordFileDeliveryAdapter(target, { postHttp }).deliver(
        file,
        new AbortController().signal,
      ),
      (value: unknown) => value === error,
    );
    expect(postHttp).toHaveBeenCalledTimes(1);
  },
);

test("Discord transport uncertainty preserves error identity without retries", async () => {
  const primary = new Error("submitted outcome unknown");
  const postHttp = mock(async (): Promise<never> => {
    throw primary;
  });
  const adapter = createDiscordFileDeliveryAdapter(target, { postHttp });
  await assert.rejects(
    adapter.deliver(file, new AbortController().signal),
    (error: unknown) => error === primary,
  );
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test.each([
  "status",
  "digest",
  "size",
  "channel",
  "filename",
  "attachment-size",
  "count",
  "message-id",
  "message-newline",
  "attachment-newline",
  "missing",
] as const)(
  "Discord rejects a mismatched %s receipt without replay",
  async (field) => {
    const result = receipt();
    assert.ok(result.responseMetadata);
    if (field === "status") result.statusCode = 429;
    else if (field === "digest") result.sha256 = "b".repeat(64);
    else if (field === "size") result.sizeBytes++;
    else if (field === "channel") result.responseMetadata["channelId"] = "999";
    else if (field === "filename")
      result.responseMetadata["filename"] = "other.png";
    else if (field === "attachment-size")
      result.responseMetadata["sizeBytes"] = 999;
    else if (field === "count") result.responseMetadata["attachmentCount"] = 2;
    else if (field === "message-id")
      result.responseMetadata["messageId"] = "not-an-id";
    else if (field === "message-newline")
      result.responseMetadata["messageId"] = "123\n";
    else if (field === "attachment-newline")
      result.responseMetadata["attachmentId"] = "123\r\n";
    else delete result.responseMetadata;
    const postHttp = mock(async () => result);
    await assert.rejects(
      createDiscordFileDeliveryAdapter(target, { postHttp }).deliver(
        file,
        new AbortController().signal,
      ),
    );
    expect(postHttp).toHaveBeenCalledTimes(1);
    const failure = new ReceivedEntityFileHttpError(
      result,
      new Error("retirement"),
    );
    const failedPost = mock(async (): Promise<never> => {
      throw failure;
    });
    await assert.rejects(
      createDiscordFileDeliveryAdapter(target, {
        postHttp: failedPost,
      }).deliver(file, new AbortController().signal),
      (error: unknown) => error === failure,
    );
    expect(failedPost).toHaveBeenCalledTimes(1);
  },
);

test("Discord validates file and routing metadata before transport submission", async () => {
  const postHttp = mock(async () => receipt());
  for (const channelId of [
    "../other",
    "channel",
    "",
    "0",
    "1".repeat(21),
    "123\n",
    "123\r\n",
  ])
    expect(() =>
      createDiscordFileDeliveryAdapter({ ...target, channelId }, { postHttp }),
    ).toThrow();
  for (const botToken of ["token\r\nInjected: value", "token\n", "token\r\n"])
    expect(() =>
      createDiscordFileDeliveryAdapter({ ...target, botToken }, { postHttp }),
    ).toThrow();
  const adapter = createDiscordFileDeliveryAdapter(target, { postHttp });
  for (const invalid of [
    { ...file, sourceFile: "relative" },
    { ...file, sizeBytes: 8 * 1024 * 1024 + 1 },
    { ...file, filename: "x".repeat(256) },
    { ...file, sha256: "bad" },
    { ...file, mimeType: "text/html" },
  ])
    await assert.rejects(
      adapter.deliver(invalid, new AbortController().signal),
    );
  expect(postHttp).not.toHaveBeenCalled();
});
