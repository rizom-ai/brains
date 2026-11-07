import {
  jidNormalizedUser,
  normalizeMessageContent,
  type AnyMessageContent,
  type BaileysEventMap,
  type MiscMessageGenerationOptions,
  type WAMessage,
  type WAMessageKey,
  type WAPresence,
} from "baileys";
import {
  Message,
  defaultEmojiResolver,
  type Adapter,
  type AdapterPostableMessage,
  type ChatInstance,
  type EmojiValue,
  type FetchResult,
  type FormattedContent,
  type RawMessage,
  type ThreadInfo,
  type WebhookOptions,
} from "chat";
import { WhatsAppFormatConverter } from "./whatsapp-format";

const THREAD_PREFIX = "whatsapp:";

export interface WhatsAppThreadId {
  jid: string;
}

/**
 * The socket calls the adapter makes. The connection loop owns the socket's
 * lifecycle and hands it over once the connection is open.
 */
export interface WhatsAppSocket {
  user?: { id: string; lid?: string | undefined } | undefined;
  sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>;
  sendPresenceUpdate(type: WAPresence, toJid?: string): Promise<void>;
}

/** The part of the Chat SDK the adapter delivers incoming messages to. */
type MessageReceiver = Pick<ChatInstance, "processMessage">;

export interface WhatsAppAdapterOptions {
  userName: string;
}

/** Status updates, broadcast lists and channels are not conversations. */
function isConversationJid(jid: string): boolean {
  return (
    jid !== "status@broadcast" &&
    !jid.endsWith("@broadcast") &&
    !jid.endsWith("@newsletter")
  );
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

function textOf(message: WAMessage): string | undefined {
  const content = normalizeMessageContent(message.message);
  const text = content?.conversation ?? content?.extendedTextMessage?.text;
  if (!text) return undefined;
  return text;
}

/**
 * The sender as a permission subject: the phone number in digits when
 * WhatsApp exposes it, otherwise the LID it keys the chat by.
 */
function senderIdOf(key: WAMessageKey): string {
  const phoneJid = [key.remoteJidAlt, key.remoteJid].find((jid) =>
    jid?.endsWith("@s.whatsapp.net"),
  );
  const jid = jidNormalizedUser(phoneJid ?? key.remoteJid ?? "");
  return phoneJid ? (jid.split("@")[0] ?? jid) : jid;
}

function dateOf(timestamp: WAMessage["messageTimestamp"]): Date {
  const seconds =
    typeof timestamp === "number" ? timestamp : (timestamp?.toNumber() ?? 0);
  return new Date(seconds * 1000);
}

/**
 * Chat SDK adapter for WhatsApp, on Baileys.
 *
 * The brain is a linked device of an ordinary WhatsApp account. Threads are
 * `whatsapp:<jid>`: a person's JID for a direct message, a group's for a
 * group. WhatsApp has no threads inside a chat, so a chat's channel id is its
 * thread id.
 */
export class WhatsAppAdapter implements Adapter<WhatsAppThreadId, WAMessage> {
  readonly name = "whatsapp";
  readonly userName: string;
  private readonly converter = new WhatsAppFormatConverter();
  private chat: MessageReceiver | undefined;
  private socket: WhatsAppSocket | undefined;

  constructor(options: WhatsAppAdapterOptions) {
    this.userName = options.userName;
  }

  async initialize(chat: MessageReceiver): Promise<void> {
    this.chat = chat;
  }

  /** The connection loop hands over an open socket. */
  attach(socket: WhatsAppSocket): void {
    this.socket = socket;
  }

  /** The connection closed; sends fail until the next socket opens. */
  detach(): void {
    this.socket = undefined;
  }

  /** Incoming WhatsApp messages from the socket, delivered to the Chat SDK. */
  async handleUpsert(
    upsert: BaileysEventMap["messages.upsert"],
    options?: WebhookOptions,
  ): Promise<void> {
    const chat = this.chat;
    if (!chat || upsert.type !== "notify") return;
    await Promise.all(
      upsert.messages
        .filter((raw) => this.isIncomingText(raw))
        .map((raw) => {
          const message = this.parseMessage(raw);
          return chat.processMessage(this, message.threadId, message, options);
        }),
    );
  }

  parseMessage(raw: WAMessage): Message<WAMessage> {
    const threadId = this.encodeThreadId({
      jid: jidNormalizedUser(raw.key.remoteJid ?? ""),
    });
    const text = textOf(raw) ?? "";
    const userId = senderIdOf(raw.key);
    return new Message({
      id: raw.key.id ?? "",
      threadId,
      text,
      formatted: this.converter.toAst(text),
      raw,
      author: {
        userId,
        userName: raw.pushName ?? userId,
        fullName: raw.pushName ?? "",
        isBot: false,
        isMe: raw.key.fromMe === true,
      },
      metadata: { dateSent: dateOf(raw.messageTimestamp), edited: false },
      attachments: [],
    });
  }

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WAMessage>> {
    return this.send(threadId, {
      text: this.converter.renderPostable(message),
    });
  }

  async editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WAMessage>> {
    const { jid } = this.decodeThreadId(threadId);
    return this.send(threadId, {
      text: this.converter.renderPostable(message),
      edit: { remoteJid: jid, fromMe: true, id: messageId },
    });
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const { jid } = this.decodeThreadId(threadId);
    await this.send(threadId, {
      delete: { remoteJid: jid, fromMe: true, id: messageId },
    });
  }

  async addReaction(
    threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
  ): Promise<void> {
    await this.react(threadId, messageId, defaultEmojiResolver.toGChat(emoji));
  }

  async removeReaction(threadId: string, messageId: string): Promise<void> {
    await this.react(threadId, messageId, "");
  }

  async startTyping(threadId: string): Promise<void> {
    const { jid } = this.decodeThreadId(threadId);
    await this.connected().sendPresenceUpdate("composing", jid);
  }

  async fetchMessages(): Promise<FetchResult<WAMessage>> {
    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    return {
      id: threadId,
      channelId: threadId,
      isDM: this.isDM(threadId),
      metadata: {},
    };
  }

  renderFormatted(content: FormattedContent): string {
    return this.converter.fromAst(content);
  }

  /** WhatsApp reaches the brain over the socket, never over HTTP. */
  async handleWebhook(): Promise<Response> {
    return new Response("WhatsApp has no webhook", { status: 404 });
  }

  encodeThreadId(platformData: WhatsAppThreadId): string {
    return `${THREAD_PREFIX}${platformData.jid}`;
  }

  decodeThreadId(threadId: string): WhatsAppThreadId {
    if (!threadId.startsWith(THREAD_PREFIX)) {
      throw new Error(`Not a WhatsApp thread id: ${threadId}`);
    }
    return { jid: threadId.slice(THREAD_PREFIX.length) };
  }

  channelIdFromThreadId(threadId: string): string {
    return threadId;
  }

  isDM(threadId: string): boolean {
    return !isGroupJid(this.decodeThreadId(threadId).jid);
  }

  /** Direct text messages from other people; groups arrive in a later step. */
  private isIncomingText(raw: WAMessage): boolean {
    const jid = raw.key.remoteJid;
    if (!jid || raw.key.fromMe) return false;
    if (!isConversationJid(jid) || isGroupJid(jid)) return false;
    return textOf(raw) !== undefined;
  }

  private async react(
    threadId: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const { jid } = this.decodeThreadId(threadId);
    await this.send(threadId, {
      react: { text, key: { remoteJid: jid, fromMe: false, id: messageId } },
    });
  }

  private async send(
    threadId: string,
    content: AnyMessageContent,
  ): Promise<RawMessage<WAMessage>> {
    const { jid } = this.decodeThreadId(threadId);
    const sent = await this.connected().sendMessage(jid, content);
    if (!sent?.key.id) {
      throw new Error("WhatsApp did not confirm the message");
    }
    return { id: sent.key.id, threadId, raw: sent };
  }

  private connected(): WhatsAppSocket {
    if (!this.socket) throw new Error("WhatsApp is not connected");
    return this.socket;
  }
}
