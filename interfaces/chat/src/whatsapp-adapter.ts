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
  type ChannelInfo,
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

/** Group messages whose sender a reaction may still need, newest last. */
const MAX_REMEMBERED_SENDERS = 1000;

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
  groupMetadata(jid: string): Promise<{ subject: string }>;
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

/** The JIDs a message @-mentions; WhatsApp sends them beside the text. */
function mentionedJidsOf(message: WAMessage): string[] {
  const content = normalizeMessageContent(message.message);
  return (content?.extendedTextMessage?.contextInfo?.mentionedJid ?? []).map(
    (jid) => jidNormalizedUser(jid),
  );
}

function userPartOf(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * The sender as a permission subject: the phone number in digits when
 * WhatsApp exposes it, otherwise the LID it keys the sender by. In a group
 * the sender is the participant; in a direct message, the chat itself.
 */
function senderIdOf(key: WAMessageKey): string {
  const candidates = key.participant
    ? [key.participantAlt, key.participant]
    : [key.remoteJidAlt, key.remoteJid];
  const phoneJid = candidates.find((jid) => jid?.endsWith("@s.whatsapp.net"));
  if (phoneJid) return userPartOf(jidNormalizedUser(phoneJid));
  return jidNormalizedUser(key.participant ?? key.remoteJid ?? "");
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
  /** A reaction in a group names the sender of the message it reacts to. */
  private readonly groupSenders = new Map<string, string>();

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
          this.rememberGroupSender(raw.key);
          const message = this.parseMessage(raw);
          return chat.processMessage(this, message.threadId, message, options);
        }),
    );
  }

  parseMessage(raw: WAMessage): Message<WAMessage> {
    const threadId = this.encodeThreadId({
      jid: jidNormalizedUser(raw.key.remoteJid ?? ""),
    });
    const ownJids = this.ownJids();
    const text = this.withOwnName(textOf(raw) ?? "", ownJids);
    const userId = senderIdOf(raw.key);
    return new Message({
      id: raw.key.id ?? "",
      threadId,
      text,
      formatted: this.converter.toAst(text),
      raw,
      isMention: mentionedJidsOf(raw).some((jid) => ownJids.includes(jid)),
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

  /** A group is named after its subject; a direct message has no name. */
  async fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
    if (this.isDM(channelId)) {
      return { id: channelId, isDM: true, metadata: {} };
    }
    const { jid } = this.decodeThreadId(channelId);
    const { subject } = await this.connected().groupMetadata(jid);
    return { id: channelId, name: subject, isDM: false, metadata: {} };
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

  /** Text from other people, in direct messages and groups. */
  private isIncomingText(raw: WAMessage): boolean {
    const jid = raw.key.remoteJid;
    if (!jid || raw.key.fromMe) return false;
    if (!isConversationJid(jid)) return false;
    return textOf(raw) !== undefined;
  }

  /** The brain's account by phone number and by LID, once connected. */
  private ownJids(): string[] {
    const user = this.socket?.user;
    return [user?.id, user?.lid].flatMap((jid) =>
      jid ? [jidNormalizedUser(jid)] : [],
    );
  }

  /** WhatsApp writes a mention as the number; the brain reads its name. */
  private withOwnName(text: string, ownJids: string[]): string {
    return ownJids.reduce(
      (renamed, jid) =>
        renamed.replace(
          new RegExp(`@${userPartOf(jid)}(?![0-9])`, "g"),
          `@${this.userName}`,
        ),
      text,
    );
  }

  private async react(
    threadId: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const { jid } = this.decodeThreadId(threadId);
    const participant = this.groupSenders.get(messageId);
    await this.send(threadId, {
      react: {
        text,
        key: {
          remoteJid: jid,
          fromMe: false,
          id: messageId,
          ...(participant ? { participant } : {}),
        },
      },
    });
  }

  private rememberGroupSender(key: WAMessageKey): void {
    if (!key.id || !key.participant) return;
    this.groupSenders.delete(key.id);
    this.groupSenders.set(key.id, key.participant);
    const oldest = this.groupSenders.keys().next().value;
    if (this.groupSenders.size > MAX_REMEMBERED_SENDERS && oldest) {
      this.groupSenders.delete(oldest);
    }
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
