// Source-only service/query proof; no runtime-owned factory or plugin replay.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createSilentLogger } from "@brains/test-utils";
import { MessageBus } from "@brains/messaging-service";
import { ConversationService } from "../shell/conversation-service/src/conversation-service";
import type { ConversationDB } from "../shell/conversation-service/src/database";
import {
  conversations,
  messages,
  summaryTracking,
} from "../shell/conversation-service/src/schema";
import { coerceConversationMetadata } from "../shell/conversation-service/src/metadata";
import {
  CONVERSATION_STARTED_CHANNEL,
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  type ConversationDigestPayload,
  type StartConversationRequest,
} from "../shell/conversation-service/src/types";
import { CONVERSATION_CHANNELS } from "../shell/conversation-service/src/conversation-channels";
import { TursoThreadProof } from "../shared/db/test/fixtures/turso-thread/client";
import { createProofDatabase } from "../shared/db/test/fixtures/turso-thread/binary-transaction";

const workerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/worker.ts",
  import.meta.url,
);
const drivers: TursoThreadProof[] = [];
let folder: string;
interface Fixture {
  driver: TursoThreadProof;
  db: ConversationDB;
  service: ConversationService;
  bus: MessageBus;
}
async function open(path: string, initialize = true): Promise<Fixture> {
  const driver = new TursoThreadProof({
    url: pathToFileURL(path).href,
    workerUrl,
  });
  drivers.push(driver);
  const db = createProofDatabase<Record<string, unknown>>(driver, {
    conversations,
    messages,
    summaryTracking,
  });
  if (initialize)
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../shell/conversation-service/drizzle", import.meta.url),
      ),
    });
  const logger = createSilentLogger();
  const bus = MessageBus.createFresh(logger);
  return {
    driver,
    db,
    bus,
    service: ConversationService.createFresh(db, logger, bus, {
      digestTriggerInterval: 2,
      digestWindowSize: 2,
    }),
  };
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "brains-thread-conversations-"));
});
afterEach(async () => {
  const results = await Promise.allSettled(
    drivers.splice(0).map((driver) => driver.close()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, "Conversation proof cleanup failed");
});
function request(
  sessionId: string,
  personId = "person-a",
): StartConversationRequest {
  return {
    sessionId,
    personId,
    interfaceType: "test",
    channelId: "channel-a",
    metadata: {
      channelName: "频道 COMMIT; BEGIN",
      interfaceType: "test",
      channelId: "channel-a",
    },
  };
}

describe("real conversation service on the isolated Turso thread", () => {
  it("persists messages, summary arithmetic, scoped search and metadata through main-file restore", async () => {
    const path = join(folder, "conversations.db");
    const { driver, db, service, bus } = await open(path);
    const notifications: string[] = [];
    const digests: ConversationDigestPayload[] = [];
    const unsubscribe = [
      bus.subscribe(CONVERSATION_STARTED_CHANNEL, (message) => {
        notifications.push(message.type);
        return { success: true };
      }),
      bus.subscribe(CONVERSATION_MESSAGE_ADDED_CHANNEL, (message) => {
        notifications.push(message.type);
        return { success: true };
      }),
      bus.subscribe<ConversationDigestPayload>(
        CONVERSATION_CHANNELS.digest,
        (message) => {
          digests.push(message.payload);
          return { success: true };
        },
      ),
    ];
    try {
      expect(await service.startConversation(request("session-a"))).toBe(
        "session-a",
      );
      expect(await service.startConversation(request("session-a"))).toBe(
        "session-a",
      );
      const contents = ["Hello 你好; COMMIT", "HELLO again", "last message"];
      for (const [index, content] of contents.entries()) {
        await service.addMessage({
          conversationId: "session-a",
          role: "user",
          content,
          metadata: { index, nested: { ok: true } },
        });
        // Explicit fixture timestamps avoid assuming the clock ticks between calls.
        await db
          .update(messages)
          .set({ timestamp: new Date(1000 + index * 1000).toISOString() })
          .where(
            and(
              eq(messages.conversationId, "session-a"),
              eq(messages.content, content),
            ),
          );
      }
      expect(
        notifications.filter((type) => type === CONVERSATION_STARTED_CHANNEL),
      ).toHaveLength(1);
      expect(
        notifications.filter(
          (type) => type === CONVERSATION_MESSAGE_ADDED_CHANNEL,
        ),
      ).toHaveLength(3);
      expect(digests).toHaveLength(1);
      expect(digests[0]).toMatchObject({
        conversationId: "session-a",
        messageCount: 2,
        windowStart: 1,
        windowEnd: 2,
        windowSize: 2,
      });
      expect(digests[0]?.messages.map((message) => message.content)).toEqual(
        contents.slice(0, 2),
      );
      expect(
        (await service.getMessages("session-a", { limit: 2 })).map(
          (message) => message.content,
        ),
      ).toEqual(contents.slice(1));
      expect(
        (
          await service.getMessages("session-a", {
            range: { start: 2, end: 3 },
          })
        ).map((message) => message.content),
      ).toEqual(contents.slice(1));
      expect(await service.countMessages("session-a")).toBe(3);
      const all = await service.getMessages("session-a");
      expect(all[0]?.metadata).toBe(
        JSON.stringify({ index: 0, nested: { ok: true } }),
      );
      expect((await db.select().from(summaryTracking))[0]).toMatchObject({
        conversationId: "session-a",
        messagesSinceSummary: 3,
        lastMessageId: all[2]?.id,
      });
      await service.startConversation(request("session-b", "person-b"));
      await service.addMessage({
        conversationId: "session-b",
        role: "assistant",
        content: "hello elsewhere",
      });
      expect(
        (await service.searchConversations("HELLO", "session-a")).map(
          (conversation) => conversation.id,
        ),
      ).toEqual(["session-a"]);
      expect(
        (await service.searchConversations("hello"))
          .map((conversation) => conversation.id)
          .sort(),
      ).toEqual(["session-a", "session-b"]);
      expect(
        (
          await service.listConversations({
            personId: "person-a",
            channelId: "channel-a",
            interfaceType: "test",
            sessionId: "session-a",
          })
        ).map((conversation) => conversation.id),
      ).toEqual(["session-a"]);
      expect(
        await service.updateConversationMetadata({
          conversationId: "session-a",
          metadata: { reviewed: true },
        }),
      ).toBe(true);
      const expected = await service.getConversation("session-a");
      expect(coerceConversationMetadata(expected?.metadata)).toMatchObject({
        channelName: "频道 COMMIT; BEGIN",
        reviewed: true,
      });
      await driver.close();
      const restoredPath = join(folder, "restored.db");
      await cp(path, restoredPath, { errorOnExist: true, force: false });
      const restored = await open(restoredPath, false);
      expect(await restored.service.getConversation("session-a")).toEqual(
        expected,
      );
      expect(await restored.service.getMessages("session-a")).toEqual(all);
    } finally {
      for (const stop of unsubscribe) stop();
    }
  });

  it("enforces message foreign keys and cascaded deletion while keeping driver ownership external", async () => {
    const { driver, db, service } = await open(join(folder, "delete.db"));
    await assert.rejects(
      service.addMessage({
        conversationId: "absent",
        role: "user",
        content: "must not persist",
      }),
    );
    expect(await service.countMessages("absent")).toBe(0);
    await service.startConversation(request("delete-me"));
    await service.startConversation(request("keep-me"));
    await service.addMessage({
      conversationId: "delete-me",
      role: "user",
      content: "child",
    });
    expect(await service.deleteConversation("delete-me")).toBe(true);
    expect(await service.deleteConversation("delete-me")).toBe(false);
    expect(await service.getConversation("delete-me")).toBeNull();
    expect(await service.countMessages("delete-me")).toBe(0);
    expect(
      (await db.select().from(summaryTracking)).map(
        (tracking) => tracking.conversationId,
      ),
    ).toEqual(["keep-me"]);
    expect(
      await service.updateConversationMetadata({
        conversationId: "absent",
        metadata: {},
      }),
    ).toBe(false);
    assert.throws(() => service.getDatabaseClient(), /does not own/);
    await service.closeAsync();
    expect(driver.closed).toBe(false);
    expect((await service.getConversation("keep-me"))?.id).toBe("keep-me");
  });
});
