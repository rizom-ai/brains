import { describe, expect, it, mock } from "bun:test";
import type { AnyMessageContent, WAMessage } from "baileys";
import type { Adapter, Message } from "chat";
import { WhatsAppAdapter, type WhatsAppSocket } from "../src/whatsapp-adapter";

const DM_JID = "31612345678@s.whatsapp.net";
const DM_THREAD = `whatsapp:${DM_JID}`;

interface ProcessedMessage {
  threadId: string;
  message: Message;
}

function createChat(): {
  processed: ProcessedMessage[];
  processMessage: (
    adapter: Adapter,
    threadId: string,
    message: Message | (() => Promise<Message>),
  ) => Promise<void>;
} {
  const processed: ProcessedMessage[] = [];
  return {
    processed,
    processMessage: async (_adapter, threadId, message): Promise<void> => {
      processed.push({
        threadId,
        message: typeof message === "function" ? await message() : message,
      });
    },
  };
}

function createSocket(): WhatsAppSocket & {
  sendMessage: ReturnType<typeof mock<WhatsAppSocket["sendMessage"]>>;
  sendPresenceUpdate: ReturnType<
    typeof mock<WhatsAppSocket["sendPresenceUpdate"]>
  >;
} {
  return {
    user: { id: "31600000001:5@s.whatsapp.net", lid: "1234567890:5@lid" },
    sendMessage: mock(
      async (jid: string, _content: AnyMessageContent): Promise<WAMessage> => ({
        key: { remoteJid: jid, fromMe: true, id: "sent-1" },
      }),
    ),
    sendPresenceUpdate: mock(async (): Promise<void> => {}),
  };
}

function inbound(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: DM_JID, fromMe: false, id: "IN-1" },
    pushName: "Mira",
    messageTimestamp: 1_794_030_000,
    message: { conversation: "Hello brain" },
    ...overrides,
  };
}

async function connectedAdapter(): Promise<{
  adapter: WhatsAppAdapter;
  chat: ReturnType<typeof createChat>;
  socket: ReturnType<typeof createSocket>;
}> {
  const adapter = new WhatsAppAdapter({ userName: "brain" });
  const chat = createChat();
  const socket = createSocket();
  await adapter.initialize(chat);
  adapter.attach(socket);
  return { adapter, chat, socket };
}

describe("WhatsAppAdapter inbound", () => {
  it("hands a direct message to the Chat SDK on its WhatsApp thread", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({ type: "notify", messages: [inbound()] });

    expect(chat.processed).toHaveLength(1);
    expect(chat.processed[0]?.threadId).toBe(DM_THREAD);
    expect(chat.processed[0]?.message).toMatchObject({
      id: "IN-1",
      threadId: DM_THREAD,
      text: "Hello brain",
      author: {
        userId: "31612345678",
        userName: "Mira",
        fullName: "Mira",
        isBot: false,
        isMe: false,
      },
    });
  });

  it("names the sender by phone number when the chat is keyed by a LID", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({
          key: {
            remoteJid: "987654321@lid",
            remoteJidAlt: DM_JID,
            fromMe: false,
            id: "IN-2",
          },
        }),
      ],
    });

    expect(chat.processed[0]?.threadId).toBe("whatsapp:987654321@lid");
    expect(chat.processed[0]?.message.author.userId).toBe("31612345678");
  });

  it("unwraps disappearing-message and extended text content", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({
          message: {
            ephemeralMessage: {
              message: { extendedTextMessage: { text: "Quietly hello" } },
            },
          },
        }),
      ],
    });

    expect(chat.processed[0]?.message.text).toBe("Quietly hello");
  });

  it("ignores its own messages, status updates, groups, history and empty content", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({ key: { remoteJid: DM_JID, fromMe: true, id: "OWN" } }),
        inbound({
          key: { remoteJid: "status@broadcast", fromMe: false, id: "STATUS" },
        }),
        inbound({
          key: {
            remoteJid: "120363000000000000@g.us",
            participant: DM_JID,
            fromMe: false,
            id: "GROUP",
          },
        }),
        inbound({ message: { reactionMessage: { text: "👍" } } }),
      ],
    });
    await adapter.handleUpsert({ type: "append", messages: [inbound()] });

    expect(chat.processed).toHaveLength(0);
  });
});

describe("WhatsAppAdapter outbound", () => {
  it("sends a markdown reply to the thread's JID as WhatsApp text", async () => {
    const { adapter, socket } = await connectedAdapter();

    const sent = await adapter.postMessage(DM_THREAD, {
      markdown: "**Done.** See _notes_.",
    });

    expect(socket.sendMessage).toHaveBeenCalledWith(DM_JID, {
      text: "*Done.* See _notes_.",
    });
    expect(sent).toMatchObject({ id: "sent-1", threadId: DM_THREAD });
  });

  it("edits a sent message in place", async () => {
    const { adapter, socket } = await connectedAdapter();

    await adapter.editMessage(DM_THREAD, "sent-1", { markdown: "**Updated**" });

    expect(socket.sendMessage).toHaveBeenCalledWith(DM_JID, {
      text: "*Updated*",
      edit: { remoteJid: DM_JID, fromMe: true, id: "sent-1" },
    });
  });

  it("deletes a sent message", async () => {
    const { adapter, socket } = await connectedAdapter();

    await adapter.deleteMessage(DM_THREAD, "sent-1");

    expect(socket.sendMessage).toHaveBeenCalledWith(DM_JID, {
      delete: { remoteJid: DM_JID, fromMe: true, id: "sent-1" },
    });
  });

  it("shows the typing indicator in the thread", async () => {
    const { adapter, socket } = await connectedAdapter();

    await adapter.startTyping(DM_THREAD);

    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith("composing", DM_JID);
  });

  it("refuses to send while WhatsApp is not connected", async () => {
    const { adapter } = await connectedAdapter();
    adapter.detach();

    const error = await adapter
      .postMessage(DM_THREAD, { markdown: "Hello" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("WhatsApp is not connected");
  });
});

describe("WhatsAppAdapter threads", () => {
  it("round-trips a JID through its thread id", () => {
    const adapter = new WhatsAppAdapter({ userName: "brain" });

    expect(adapter.encodeThreadId({ jid: DM_JID })).toBe(DM_THREAD);
    expect(adapter.decodeThreadId(DM_THREAD)).toEqual({ jid: DM_JID });
    expect(adapter.channelIdFromThreadId(DM_THREAD)).toBe(DM_THREAD);
  });

  it("treats person JIDs as direct messages and group JIDs as channels", () => {
    const adapter = new WhatsAppAdapter({ userName: "brain" });

    expect(adapter.isDM(DM_THREAD)).toBe(true);
    expect(adapter.isDM("whatsapp:987654321@lid")).toBe(true);
    expect(adapter.isDM("whatsapp:120363000000000000@g.us")).toBe(false);
  });

  it("rejects a thread id from another platform", () => {
    const adapter = new WhatsAppAdapter({ userName: "brain" });

    expect(() => adapter.decodeThreadId("slack:C123")).toThrow(
      "Not a WhatsApp thread id",
    );
  });
});
