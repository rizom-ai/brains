import { expect, test, spyOn } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import {
  AtprotoBlobEvidenceError,
  collectAtprotoBlobEvidence,
} from "@brains/atproto-contracts";
import { AcknowledgedAtprotoBlobError } from "../src/pds-client";
import { PublishingTaskQueue } from "../src/publishing-tasks";
import { atprotoPublishFailedPayloadSchema } from "../src/publish-contracts";
const details = {
  operation: "upsert-record" as const,
  entityType: "post",
  entityId: "post-1",
  collection: "ai.rizom.brain.post",
};
const blob = {
  ref: { $link: "received-cid" },
  mimeType: "image/png",
  size: 70,
};

for (const reportingFails of [false, true]) {
  test(`ambient failures retain receipts without replay; reporting failure=${reportingFails}`, async () => {
    const context = createMockServicePluginContext();
    const send = spyOn(context.messaging, "send");
    if (reportingFails)
      send.mockImplementation(async (): Promise<never> => {
        throw new Error("secret report diagnostics");
      });
    const logs = spyOn(context.logger, "error").mockImplementation(() => {});
    const queue = new PublishingTaskQueue(context.logger, () => true);
    const received = new AcknowledgedAtprotoBlobError({ blob });
    const failure = new AtprotoBlobEvidenceError(
      "secret SDK diagnostics",
      "body-images",
      [{ blob, imageId: "body-1", sha256: "a".repeat(64) }],
      {
        cause: new AggregateError(
          [received, new Error("secret retirement detail")],
          "private transport graph",
        ),
      },
    );
    let attempts = 0;
    try {
      await queue.run("post", () =>
        queue.runTrigger(context, details, async () => {
          attempts++;
          throw failure;
        }),
      );
      await queue.settle();
      expect(attempts).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      const payload = atprotoPublishFailedPayloadSchema.parse(
        send.mock.calls[0]?.[0].payload,
      );
      expect(payload.entityId).toBe("post-1");
      expect(payload.recovery?.nodes[0]?.status).toBe("acknowledged");
      expect(
        payload.recovery?.nodes.some(
          (node) => node.stage === "blob-receipt" && node.status === "received",
        ),
      ).toBe(true);
      expect(JSON.stringify(payload)).not.toContain("secret");
      expect(JSON.stringify(logs.mock.calls)).not.toContain("secret");
      expect(JSON.stringify(logs.mock.calls)).toContain("received-cid");
      expect(logs.mock.calls.length).toBe(reportingFails ? 2 : 1);
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(
        64 * 1024,
      );
    } finally {
      send.mockRestore();
      logs.mockRestore();
    }
  });
}

test("invalid routing metadata is not broadcast and does not erase receipt logs", async () => {
  const context = createMockServicePluginContext();
  const send = spyOn(context.messaging, "send");
  const logs = spyOn(context.logger, "error").mockImplementation(() => {});
  try {
    await new PublishingTaskQueue(context.logger, () => true).reportFailure(
      context,
      { ...details, entityId: "x".repeat(1025) },
      new AcknowledgedAtprotoBlobError({ blob }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.mock.calls)).toContain("received-cid");
    expect(JSON.stringify(logs.mock.calls)).not.toContain("x".repeat(1025));
  } finally {
    send.mockRestore();
    logs.mockRestore();
  }
});

test("worst-case escaped report fields and recovery stay inside 64 KiB", () => {
  const large = { blob: { ...blob, ref: { $link: "\u0001".repeat(1024) } } };
  const errors = Array.from(
    { length: 16 },
    () =>
      new AtprotoBlobEvidenceError(
        "cover",
        "cover",
        Array.from({ length: 16 }, () => large),
      ),
  );
  const recovery = collectAtprotoBlobEvidence(
    new AggregateError(errors, "many"),
  );
  const payload = atprotoPublishFailedPayloadSchema.parse({
    ...details,
    entityType: "\u0001".repeat(256),
    entityId: "\u0001".repeat(1024),
    collection: "\u0001".repeat(256),
    error: "\u0001".repeat(1024),
    recovery,
  });
  expect(payload.recovery?.truncated).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(64 * 1024);
});

test("plain failures remain bounded and do not acquire invented receipts", async () => {
  const context = createMockServicePluginContext();
  const send = spyOn(context.messaging, "send");
  try {
    await new PublishingTaskQueue(context.logger, () => true).reportFailure(
      context,
      details,
      new Error("x".repeat(100_000)),
    );
    const payload = atprotoPublishFailedPayloadSchema.parse(
      send.mock.calls[0]?.[0].payload,
    );
    expect(payload.error.length).toBe(1024);
    expect(payload.recovery).toBeUndefined();
  } finally {
    send.mockRestore();
  }
});

test("unexpected queued failures keep bounded evidence and settle without replay", async () => {
  const context = createMockServicePluginContext();
  const logs = spyOn(context.logger, "error").mockImplementation(() => {});
  const queue = new PublishingTaskQueue(context.logger, () => true);
  try {
    await queue.run("post", async () => {
      throw new AcknowledgedAtprotoBlobError({ blob });
    });
    await queue.settle();
    expect(logs).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logs.mock.calls)).toContain("received-cid");
  } finally {
    logs.mockRestore();
  }
});
