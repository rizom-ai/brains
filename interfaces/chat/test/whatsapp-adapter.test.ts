import { describe, expect, it, mock } from "bun:test";
import type { AnyMessageContent, WAMessage } from "baileys";
import type { Adapter, Message } from "chat";
import { WhatsAppAdapter, type WhatsAppSocket } from "../src/whatsapp-adapter";

const DM_JID = "31612345678@s.whatsapp.net";
const DM_THREAD = `whatsapp:${DM_JID}`;
const GROUP_JID = "120363000000000000@g.us";
const GROUP_THREAD = `whatsapp:${GROUP_JID}`;

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
  groupMetadata: ReturnType<typeof mock<WhatsAppSocket["groupMetadata"]>>;
  getPNForLID: ReturnType<typeof mock<(lid: string) => Promise<string | null>>>;
} {
  const getPNForLID = mock(
    async (_lid: string): Promise<string | null> => null,
  );
  return {
    user: { id: "31600000001:5@s.whatsapp.net", lid: "1234567890:5@lid" },
    sendMessage: mock(
      async (jid: string, _content: AnyMessageContent): Promise<WAMessage> => ({
        key: { remoteJid: jid, fromMe: true, id: "sent-1" },
      }),
    ),
    sendPresenceUpdate: mock(async (): Promise<void> => {}),
    groupMetadata: mock(async () => ({ subject: "Rizom team" })),
    signalRepository: { lidMapping: { getPNForLID } },
    updateMediaMessage: async (message: WAMessage): Promise<WAMessage> =>
      message,
    getPNForLID,
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

  it("ignores its own messages, status updates, history and empty content", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({ key: { remoteJid: DM_JID, fromMe: true, id: "OWN" } }),
        inbound({
          key: { remoteJid: "status@broadcast", fromMe: false, id: "STATUS" },
        }),
        inbound({ message: { reactionMessage: { text: "👍" } } }),
      ],
    });
    await adapter.handleUpsert({ type: "append", messages: [inbound()] });

    expect(chat.processed).toHaveLength(0);
  });
});

describe("WhatsAppAdapter groups", () => {
  function groupMessage(text: string, mentionedJid: string[] = []): WAMessage {
    return inbound({
      key: {
        remoteJid: GROUP_JID,
        participant: "987654321@lid",
        participantAlt: DM_JID,
        fromMe: false,
        id: "GROUP-1",
      },
      message: {
        extendedTextMessage: { text, contextInfo: { mentionedJid } },
      },
    });
  }

  it("hands a group message to the group's thread, from its participant", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [groupMessage("Morning all")],
    });

    expect(chat.processed[0]?.threadId).toBe(GROUP_THREAD);
    expect(chat.processed[0]?.message).toMatchObject({
      text: "Morning all",
      isMention: false,
      author: { userId: "31612345678", userName: "Mira" },
    });
  });

  it.each([
    ["phone number", "31600000001@s.whatsapp.net"],
    ["LID", "1234567890@lid"],
  ])("treats a mention of the brain's %s as a mention", async (_, jid) => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [groupMessage("@31600000001 what is next?", [jid])],
    });

    expect(chat.processed[0]?.message.isMention).toBe(true);
  });

  it("does not treat a mention of someone else as a mention", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        groupMessage("@31699999999 hi", ["31699999999@s.whatsapp.net"]),
      ],
    });

    expect(chat.processed[0]?.message.isMention).toBe(false);
  });

  it("reacts to a group message as its sender's message", async () => {
    const { adapter, socket } = await connectedAdapter();
    await adapter.handleUpsert({
      type: "notify",
      messages: [groupMessage("Ship it?")],
    });

    await adapter.addReaction(GROUP_THREAD, "GROUP-1", "👍");

    expect(socket.sendMessage).toHaveBeenCalledWith(GROUP_JID, {
      react: {
        text: "👍",
        key: {
          remoteJid: GROUP_JID,
          fromMe: false,
          id: "GROUP-1",
          participant: "987654321@lid",
        },
      },
    });
  });

  it("shows the brain's mention by its name", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        groupMessage("@31600000001 and @1234567890, what is next?", [
          "31600000001@s.whatsapp.net",
        ]),
      ],
    });

    expect(chat.processed[0]?.message.text).toBe(
      "@brain and @brain, what is next?",
    );
  });
});

describe("WhatsAppAdapter identity", () => {
  function fromLid(remoteJid: string, participant?: string): WAMessage {
    return inbound({
      key: {
        remoteJid,
        ...(participant ? { participant } : {}),
        fromMe: false,
        id: "LID-1",
      },
    });
  }

  it("resolves a group sender known only by LID to their phone number", async () => {
    const { adapter, chat, socket } = await connectedAdapter();
    socket.getPNForLID.mockImplementation(async (lid) =>
      lid === "987654321@lid" ? "31612345678:0@s.whatsapp.net" : null,
    );

    await adapter.handleUpsert({
      type: "notify",
      messages: [fromLid(GROUP_JID, "987654321@lid")],
    });

    expect(chat.processed[0]?.message.author.userId).toBe("31612345678");
  });

  it("resolves a direct message keyed by LID to the sender's phone number", async () => {
    const { adapter, chat, socket } = await connectedAdapter();
    socket.getPNForLID.mockImplementation(
      async () => "31612345678:0@s.whatsapp.net",
    );

    await adapter.handleUpsert({
      type: "notify",
      messages: [fromLid("987654321@lid")],
    });

    expect(chat.processed[0]?.threadId).toBe("whatsapp:987654321@lid");
    expect(chat.processed[0]?.message.author.userId).toBe("31612345678");
  });

  it("keeps an unmapped LID as the sender", async () => {
    const { adapter, chat } = await connectedAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [fromLid(GROUP_JID, "987654321@lid")],
    });

    expect(chat.processed[0]?.message.author.userId).toBe("987654321@lid");
  });

  it("asks WhatsApp's mapping once per LID", async () => {
    const { adapter, socket } = await connectedAdapter();
    socket.getPNForLID.mockImplementation(
      async () => "31612345678:0@s.whatsapp.net",
    );

    await adapter.handleUpsert({
      type: "notify",
      messages: [fromLid(GROUP_JID, "987654321@lid")],
    });
    await adapter.handleUpsert({
      type: "notify",
      messages: [fromLid(GROUP_JID, "987654321@lid")],
    });

    expect(socket.getPNForLID).toHaveBeenCalledTimes(1);
  });

  it("does not ask the mapping when WhatsApp names the phone number", async () => {
    const { adapter, socket } = await connectedAdapter();

    await adapter.handleUpsert({ type: "notify", messages: [inbound()] });

    expect(socket.getPNForLID).not.toHaveBeenCalled();
  });
});

/** A 1×1 PNG, enough for Bun.Image to decode. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("WhatsAppAdapter media", () => {
  async function mediaAdapter(): Promise<
    Awaited<ReturnType<typeof connectedAdapter>> & {
      downloadMedia: ReturnType<
        typeof mock<(raw: WAMessage) => Promise<Buffer>>
      >;
    }
  > {
    const downloadMedia = mock(async (_raw: WAMessage): Promise<Buffer> =>
      Buffer.from("media-bytes"),
    );
    const adapter = new WhatsAppAdapter({ userName: "brain", downloadMedia });
    const chat = createChat();
    const socket = createSocket();
    await adapter.initialize(chat);
    adapter.attach(socket);
    return { adapter, chat, socket, downloadMedia };
  }

  it("hands over an image with its caption as the text", async () => {
    const { adapter, chat, downloadMedia } = await mediaAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({
          message: {
            imageMessage: {
              caption: "The whiteboard",
              mimetype: "image/jpeg",
              fileLength: 2048,
            },
          },
        }),
      ],
    });
    const message = chat.processed[0]?.message;
    const data = await message?.attachments[0]?.fetchData?.();

    expect(message?.text).toBe("The whiteboard");
    expect(message?.attachments[0]).toMatchObject({
      type: "image",
      name: "IN-1.jpg",
      mimeType: "image/jpeg",
      size: 2048,
    });
    expect(data).toEqual(Buffer.from("media-bytes"));
    expect(downloadMedia).toHaveBeenCalledTimes(1);
  });

  it("names a document by its file name", async () => {
    const { adapter, chat } = await mediaAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({
          message: {
            documentMessage: {
              fileName: "plan.pdf",
              mimetype: "application/pdf",
              fileLength: 4096,
            },
          },
        }),
      ],
    });

    expect(chat.processed[0]?.message.text).toBe("");
    expect(chat.processed[0]?.message.attachments[0]).toMatchObject({
      type: "file",
      name: "plan.pdf",
      mimeType: "application/pdf",
    });
  });

  it.each([
    ["audioMessage", "audio", "audio/ogg; codecs=opus", "IN-1.ogg"],
    ["videoMessage", "video", "video/mp4", "IN-1.mp4"],
  ] as const)("hands over %s as %s", async (kind, type, mimetype, name) => {
    const { adapter, chat } = await mediaAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [inbound({ message: { [kind]: { mimetype } } })],
    });

    expect(chat.processed[0]?.message.attachments[0]).toMatchObject({
      type,
      name,
    });
  });

  it("reads a mention in a caption", async () => {
    const { adapter, chat } = await mediaAdapter();

    await adapter.handleUpsert({
      type: "notify",
      messages: [
        inbound({
          key: {
            remoteJid: GROUP_JID,
            participant: DM_JID,
            fromMe: false,
            id: "IN-1",
          },
          message: {
            imageMessage: {
              caption: "@31600000001 what is this?",
              mimetype: "image/jpeg",
              contextInfo: { mentionedJid: ["31600000001@s.whatsapp.net"] },
            },
          },
        }),
      ],
    });

    expect(chat.processed[0]?.message).toMatchObject({
      isMention: true,
      text: "@brain what is this?",
    });
  });

  it("sends a generated image after its text, with a Bun.Image thumbnail", async () => {
    const { adapter, socket } = await mediaAdapter();

    await adapter.postMessage(DM_THREAD, {
      markdown: "Here is the chart",
      files: [{ filename: "chart.png", mimeType: "image/png", data: PNG }],
    });

    expect(socket.sendMessage.mock.calls[0]).toEqual([
      DM_JID,
      { text: "Here is the chart" },
    ]);
    const image = socket.sendMessage.mock.calls[1]?.[1];
    expect(image).toMatchObject({ image: PNG, mimetype: "image/png" });
    const thumbnail =
      image && "jpegThumbnail" in image ? image.jpegThumbnail : undefined;
    // A JPEG, so Baileys never reaches for an image library of its own.
    expect(Buffer.from(String(thumbnail), "base64").subarray(0, 2)).toEqual(
      Buffer.from([0xff, 0xd8]),
    );
  });

  it("sends other files as documents", async () => {
    const { adapter, socket } = await mediaAdapter();
    const pdf = Buffer.from("%PDF-1.7");

    await adapter.postMessage(DM_THREAD, {
      raw: "",
      files: [
        { filename: "notes.pdf", mimeType: "application/pdf", data: pdf },
      ],
    });

    expect(socket.sendMessage.mock.calls).toEqual([
      [
        DM_JID,
        { document: pdf, mimetype: "application/pdf", fileName: "notes.pdf" },
      ],
    ]);
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

  it("names a group channel after its subject", async () => {
    const { adapter } = await connectedAdapter();

    expect(await adapter.fetchChannelInfo(GROUP_THREAD)).toEqual({
      id: GROUP_THREAD,
      name: "Rizom team",
      isDM: false,
      metadata: {},
    });
  });

  it("describes a direct message channel without asking WhatsApp", async () => {
    const { adapter, socket } = await connectedAdapter();

    expect(await adapter.fetchChannelInfo(DM_THREAD)).toEqual({
      id: DM_THREAD,
      isDM: true,
      metadata: {},
    });
    expect(socket.groupMetadata).not.toHaveBeenCalled();
  });

  it("rejects a thread id from another platform", () => {
    const adapter = new WhatsAppAdapter({ userName: "brain" });

    expect(() => adapter.decodeThreadId("slack:C123")).toThrow(
      "Not a WhatsApp thread id",
    );
  });
});
