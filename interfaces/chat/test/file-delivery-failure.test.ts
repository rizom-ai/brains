import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  ChatArtifactDeliveryError,
  collectChatFileFailure,
  reportChatFileFailure,
  CHAT_FILE_FAILURE_NOTICE,
} from "../src/file-delivery-failure";
import { ReceivedDiscordFileDeliveryError } from "../src/discord-file-delivery";
import { AcknowledgedFileDeliveryError } from "../src/file-delivery";
import { PartialSlackFileDeliveryError } from "../src/slack-file-delivery";

const receipt = { messageId: "123", channelId: "456", attachmentId: "789" };
test("final evidence preserves prefixes, received and acknowledged outcomes through cycles without private causes", () => {
  const cause = new Error("private URL and credentials");
  const received = new ReceivedDiscordFileDeliveryError(receipt, cause);
  const acknowledged = new AcknowledgedFileDeliveryError(receipt, cause);
  const aggregate = new AggregateError([received, acknowledged, received]);
  const prefix = new ChatArtifactDeliveryError(
    new Set(["completed-card"]),
    aggregate,
  );
  cause.cause = prefix;
  const evidence = collectChatFileFailure(prefix);
  assert.ok(evidence);
  expect(evidence.nodes[0]?.deliveredCardIds).toEqual(["completed-card"]);
  expect(
    evidence.nodes.flatMap((node) =>
      node.outcome ? [node.outcome.stage] : [],
    ),
  ).toEqual(["received", "acknowledged"]);
  expect(evidence.nodes[1]?.errors).toEqual([2, 3, 2]);
  expect(evidence.nodes[4]?.cause).toBe(0);
  expect(JSON.stringify(evidence)).not.toContain("private");
  expect(Object.isFrozen(evidence.nodes[0]?.deliveredCardIds)).toBe(true);
  expect(Object.isFrozen(evidence.nodes[2]?.outcome)).toBe(true);
  expect(evidence.invalid).toBe(false);
  expect(evidence.truncated).toBe(false);
});
test("Slack stages are not promoted to delivery acknowledgement", () => {
  const failure = new PartialSlackFileDeliveryError(
    {
      fileId: "F123",
      channelId: "C123",
      sha256: "a".repeat(64),
      stage: "share-response-received",
      completedFileId: "F456",
      threadTs: "123.456",
    },
    new Error("private"),
  );
  expect(collectChatFileFailure(failure)?.nodes[0]?.outcome).toEqual({
    ...failure.recovery,
    platform: "slack",
  });
  expect(
    collectChatFileFailure(
      new AcknowledgedFileDeliveryError(
        { fileId: "F123", privatePath: "/private" },
        failure,
      ),
    )?.nodes[0]?.outcome,
  ).toEqual({ fileId: "F123", platform: "slack", stage: "acknowledged" });
});
test("bounded traversal flags hidden outcomes and malformed markers independently", () => {
  const invalid = new AcknowledgedFileDeliveryError(
    { fileId: "https://private" },
    undefined,
  );
  const valid = new ReceivedDiscordFileDeliveryError(receipt, undefined);
  Object.defineProperty(invalid, "cause", {
    get: (): never => {
      throw new Error("private getter");
    },
  });
  const evidence = collectChatFileFailure(
    new AggregateError([
      invalid,
      valid,
      ...Array.from({ length: 12 }, () => new Error("private")),
    ]),
  );
  expect(evidence?.invalid).toBe(true);
  expect(evidence?.truncated).toBe(true);
  expect(
    evidence?.nodes.some((node) => node.outcome?.stage === "received"),
  ).toBe(true);
  expect(JSON.stringify(evidence)).not.toContain("private");
  let chain: Error = valid;
  for (let index = 0; index < 20; index++)
    chain = new Error("private", { cause: chain });
  expect(collectChatFileFailure(chain)?.truncated).toBe(true);
  expect(collectChatFileFailure(new Error("ordinary"))).toBeUndefined();
});
test("metadata remains below 16 KiB with explicit prefix and byte truncation", () => {
  const cards = new Set(
    Array.from(
      { length: 5 },
      (_, index) => String(index) + "\u0000".repeat(127),
    ),
  );
  const evidence = collectChatFileFailure(
    new AggregateError(
      Array.from(
        { length: 8 },
        () => new ChatArtifactDeliveryError(cards, undefined),
      ),
    ),
  );
  assert.ok(evidence);
  expect(evidence.truncated).toBe(true);
  expect(evidence.nodes.length).toBe(9);
  expect(
    new TextEncoder().encode(JSON.stringify(evidence)).byteLength,
  ).toBeLessThan(16 * 1024);
  expect(
    evidence.nodes.filter((node) => node.deliveredCardIds).length,
  ).toBeLessThan(8);
});
test("logging and notice failure retain original causes, with notice joined and no raw receipts sent to chat", async () => {
  const original = new ReceivedDiscordFileDeliveryError(
    receipt,
    new Error("private"),
  );
  const logging = new Error("logger failed");
  const posting = new Error("notice failed");
  const gate = Promise.withResolvers<void>();
  let entered = false;
  let settled = false;
  const result = reportChatFileFailure(
    original,
    (diagnostic): never => {
      expect(diagnostic.recovery?.nodes[0]?.outcome?.stage).toBe("received");
      expect(JSON.stringify(diagnostic)).not.toContain("private");
      throw logging;
    },
    async (error): Promise<void> => {
      expect(error).toBe(CHAT_FILE_FAILURE_NOTICE);
      entered = true;
      await gate.promise;
      throw posting;
    },
  ).catch((error: unknown): unknown => {
    settled = true;
    return error;
  });
  expect(entered).toBe(true);
  expect(settled).toBe(false);
  gate.resolve();
  const failure = await result;
  assert.ok(failure instanceof AggregateError);
  expect(failure.cause).toBe(original);
  expect(failure.errors).toEqual([original, logging, posting]);
});
