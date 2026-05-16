import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EMAIL_SEND, type SendEmailPayload } from "@brains/email-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { Logger } from "@brains/utils";
import {
  OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL,
  OperatorNotificationsPlugin,
  type SendTransactionalNotificationResult,
} from "../src";

const tempDirs: string[] = [];

async function tempDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-operator-notifications-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("OperatorNotificationsPlugin", () => {
  it("forwards email notifications to the generic email channel", async () => {
    const harness = createPluginHarness<OperatorNotificationsPlugin>({
      dataDir: await tempDataDir(),
      logger: Logger.createFresh({ level: 0 }),
    });
    const sent: SendEmailPayload[] = [];

    harness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return { success: true, data: { status: "sent", id: "email_123" } };
      },
    );

    await harness.installPlugin(new OperatorNotificationsPlugin());

    const result = await harness.sendMessage<
      unknown,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, {
      contacts: [{ type: "email", address: "user@example.com" }],
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      dedupeKey: "setup:user",
    });

    expect(result).toEqual({ status: "sent", deliveryId: "email_123" });
    expect(sent).toEqual([
      {
        to: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the secret setup link.",
        sensitivity: "secret",
      },
    ]);
  });

  it("dedupes notifications with the same dedupe key", async () => {
    const harness = createPluginHarness<OperatorNotificationsPlugin>({
      dataDir: await tempDataDir(),
    });
    const sent: SendEmailPayload[] = [];

    harness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return {
          success: true,
          data: { status: "sent", id: `email_${sent.length}` },
        };
      },
    );

    await harness.installPlugin(new OperatorNotificationsPlugin());

    const payload = {
      contacts: [{ type: "email", address: "user@example.com" }],
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      dedupeKey: "setup:user",
    };

    const first = await harness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);
    const second = await harness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);

    expect(first).toEqual({ status: "sent", deliveryId: "email_1" });
    expect(second).toEqual({ status: "duplicate" });
    expect(sent).toHaveLength(1);
  });

  it("dedupes across plugin restarts via persisted storage", async () => {
    const dataDir = await tempDataDir();
    const payload = {
      contacts: [{ type: "email", address: "user@example.com" }],
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      dedupeKey: "setup:user",
    };

    const firstHarness = createPluginHarness<OperatorNotificationsPlugin>({
      dataDir,
    });
    const sentByFirst: SendEmailPayload[] = [];
    firstHarness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sentByFirst.push(message.payload);
        return { success: true, data: { status: "sent", id: "email_1" } };
      },
    );
    await firstHarness.installPlugin(new OperatorNotificationsPlugin());
    const first = await firstHarness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);
    expect(first).toEqual({ status: "sent", deliveryId: "email_1" });

    const secondHarness = createPluginHarness<OperatorNotificationsPlugin>({
      dataDir,
    });
    const sentBySecond: SendEmailPayload[] = [];
    secondHarness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sentBySecond.push(message.payload);
        return { success: true, data: { status: "sent", id: "email_2" } };
      },
    );
    await secondHarness.installPlugin(new OperatorNotificationsPlugin());
    const second = await secondHarness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);

    expect(second).toEqual({ status: "duplicate" });
    expect(sentBySecond).toHaveLength(0);

    const stored = await readFile(
      join(dataDir, "operator-notifications", "dedupe.json"),
      "utf8",
    );
    expect(stored).toContain("keyHash");
    expect(stored).not.toContain("setup:user");
  });
});
