import {
  downloadMediaMessage,
  jidNormalizedUser,
  normalizeMessageContent,
  type AnyMessageContent,
  type BaileysEventMap,
  type MiscMessageGenerationOptions,
  type SocketConfig,
  type WAMessage,
  type WAMessageKey,
  type WAPresence,
  type proto,
} from "baileys";
import {
  Message,
  defaultEmojiResolver,
  type Adapter,
  type AdapterPostableMessage,
  type Attachment,
  type ChannelInfo,
  type ChatInstance,
  type EmojiValue,
  type FetchResult,
  type FileUpload,
  type FormattedContent,
  type RawMessage,
  type ThreadInfo,
  type WebhookOptions,
} from "chat";
import { WhatsAppFormatConverter } from "./whatsapp-format";

const THREAD_PREFIX = "whatsapp:";

/** Group messages whose sender a reaction may still need, newest last. */
const MAX_REMEMBERED_SENDERS = 1000;
/** Senders' LIDs already resolved to phone numbers, newest last. */
const MAX_REMEMBERED_PHONES = 5000;

/** Remember an entry, forgetting the oldest once the map is full. */
function rememberBounded(
  map: Map<string, string>,
  key: string,
  value: string,
  max: number,
): void {
  map.delete(key);
  map.set(key, value);
  const oldest = map.keys().next().value;
  if (map.size > max && oldest !== undefined) map.delete(oldest);
}

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
  signalRepository: {
    lidMapping: { getPNForLID(lid: string): Promise<string | null> };
  };
  /** Asks the sender's phone to upload expired media again. */
  updateMediaMessage(message: WAMessage): Promise<WAMessage>;
}

/** Downloads a media message's bytes. */
export type DownloadWhatsAppMedia = (message: WAMessage) => Promise<Buffer>;

/** The part of the Chat SDK the adapter delivers incoming messages to. */
type MessageReceiver = Pick<ChatInstance, "processMessage">;

export interface WhatsAppAdapterOptions {
  userName: string;
  /** Defaults to Baileys' download from WhatsApp's media servers. */
  downloadMedia?: DownloadWhatsAppMedia | undefined;
}

/** Baileys' download logs nothing the brain needs. */
const quietLogger: SocketConfig["logger"] = {
  level: "silent",
  child: (): SocketConfig["logger"] => quietLogger,
  trace: (): void => {},
  debug: (): void => {},
  info: (): void => {},
  warn: (): void => {},
  error: (): void => {},
};

/** The fields WhatsApp's image, video, audio and document messages share. */
interface MediaFields {
  mimetype?: string | null;
  fileLength?: number | { toNumber(): number } | null;
  caption?: string | null;
  fileName?: string | null;
  contextInfo?: proto.IContextInfo | null;
}

const MEDIA_KINDS = [
  { kind: "imageMessage", type: "image" },
  { kind: "videoMessage", type: "video" },
  { kind: "audioMessage", type: "audio" },
  { kind: "documentMessage", type: "file" },
] as const satisfies ReadonlyArray<{
  kind: keyof proto.IMessage;
  type: Attachment["type"];
}>;

/** File extensions WhatsApp's own MIME subtypes would misname. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "text/plain": "txt",
};

/** Images WhatsApp shows inline; other files go out as documents. */
const INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function mediaOf(
  message: WAMessage,
): { type: Attachment["type"]; fields: MediaFields } | undefined {
  const content = normalizeMessageContent(message.message);
  return MEDIA_KINDS.flatMap(({ kind, type }) => {
    const fields: MediaFields | null | undefined = content?.[kind];
    return fields ? [{ type, fields }] : [];
  })[0];
}

function extensionOf(mimetype: string): string {
  const base = mimetype.split(";")[0]?.trim() ?? mimetype;
  return EXTENSIONS[base] ?? base.split("/")[1] ?? "bin";
}

function filesOf(message: AdapterPostableMessage): FileUpload[] {
  if (typeof message !== "object" || !("files" in message)) return [];
  return message.files ?? [];
}

async function bufferOf(data: FileUpload["data"]): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * A 32-pixel JPEG thumbnail, as Baileys makes with sharp; a message that
 * carries one never sends Baileys to an image library. Undefined for an image
 * Bun cannot decode, which then goes out as a document.
 */
async function thumbnailOf(image: Buffer): Promise<string | undefined> {
  try {
    const jpeg = await new Bun.Image(image)
      .resize(32)
      .jpeg({ quality: 50 })
      .toBuffer();
    return jpeg.toString("base64");
  } catch {
    // Not decodable as an image: the caller sends it as a document instead.
    return undefined;
  }
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

/** A message's text, or a media message's caption. */
function textOf(message: WAMessage): string | undefined {
  const content = normalizeMessageContent(message.message);
  const text =
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    mediaOf(message)?.fields.caption;
  if (!text) return undefined;
  return text;
}

/** The JIDs a message @-mentions; WhatsApp sends them beside the text. */
function mentionedJidsOf(message: WAMessage): string[] {
  const content = normalizeMessageContent(message.message);
  const contextInfo =
    content?.extendedTextMessage?.contextInfo ??
    mediaOf(message)?.fields.contextInfo;
  return (contextInfo?.mentionedJid ?? []).map((jid) => jidNormalizedUser(jid));
}

function userPartOf(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * Who sent a message, as WhatsApp names them: in a group the participant, in
 * a direct message the chat itself. `phoneJid` is set when WhatsApp exposes
 * the phone number beside the LID it keys the sender by.
 */
function senderOf(key: WAMessageKey): { jid: string; phoneJid?: string } {
  const candidates = key.participant
    ? [key.participantAlt, key.participant]
    : [key.remoteJidAlt, key.remoteJid];
  const phoneJid = candidates.find((jid) => jid?.endsWith("@s.whatsapp.net"));
  const jid = jidNormalizedUser(key.participant ?? key.remoteJid ?? "");
  return phoneJid ? { jid, phoneJid: jidNormalizedUser(phoneJid) } : { jid };
}

function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
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
  /** Phone numbers, in digits, of senders WhatsApp names only by LID. */
  private readonly phonesByLid = new Map<string, string>();

  private readonly downloadMedia: DownloadWhatsAppMedia;

  constructor(options: WhatsAppAdapterOptions) {
    this.userName = options.userName;
    this.downloadMedia =
      options.downloadMedia ??
      ((message): Promise<Buffer> =>
        downloadMediaMessage(
          message,
          "buffer",
          {},
          {
            logger: quietLogger,
            reuploadRequest: (expired) =>
              this.connected().updateMediaMessage(expired),
          },
        ));
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
        .filter((raw) => this.isIncoming(raw))
        .map(async (raw) => {
          this.rememberGroupSender(raw.key);
          await this.resolvePhone(raw.key);
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
    const userId = this.senderIdOf(raw.key);
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
      attachments: this.attachmentsOf(raw),
    });
  }

  /** The text, then each file as its own message. */
  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WAMessage>> {
    const text = this.converter.renderPostable(message);
    const files = filesOf(message);
    const sent: RawMessage<WAMessage>[] = [];
    if (text.trim() !== "" || files.length === 0) {
      sent.push(await this.send(threadId, { text }));
    }
    for (const file of files) {
      sent.push(await this.send(threadId, await this.fileContent(file)));
    }
    const [first] = sent;
    if (!first) throw new Error("WhatsApp did not confirm the message");
    return first;
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

  /** Text and media from other people, in direct messages and groups. */
  private isIncoming(raw: WAMessage): boolean {
    const jid = raw.key.remoteJid;
    if (!jid || raw.key.fromMe) return false;
    if (!isConversationJid(jid)) return false;
    return textOf(raw) !== undefined || mediaOf(raw) !== undefined;
  }

  /** A media message's file, fetched only when the brain reads it. */
  private attachmentsOf(raw: WAMessage): Attachment[] {
    const media = mediaOf(raw);
    if (!media) return [];
    const { mimetype, fileLength, fileName } = media.fields;
    const size =
      typeof fileLength === "number" ? fileLength : fileLength?.toNumber();
    return [
      {
        type: media.type,
        name:
          fileName ??
          `${raw.key.id ?? "upload"}.${extensionOf(mimetype ?? "")}`,
        ...(mimetype ? { mimeType: mimetype } : {}),
        ...(size !== undefined ? { size } : {}),
        fetchData: (): Promise<Buffer> => this.downloadMedia(raw),
      },
    ];
  }

  private async fileContent(file: FileUpload): Promise<AnyMessageContent> {
    const data = await bufferOf(file.data);
    const mimetype = file.mimeType ?? "application/octet-stream";
    const jpegThumbnail = INLINE_IMAGE_TYPES.has(mimetype)
      ? await thumbnailOf(data)
      : undefined;
    if (jpegThumbnail) return { image: data, mimetype, jpegThumbnail };
    return { document: data, mimetype, fileName: file.filename };
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
    rememberBounded(
      this.groupSenders,
      key.id,
      key.participant,
      MAX_REMEMBERED_SENDERS,
    );
  }

  /**
   * The sender as a permission subject: the phone number in digits, from the
   * message or from the account's LID mapping, otherwise the LID itself.
   */
  private senderIdOf(key: WAMessageKey): string {
    const sender = senderOf(key);
    if (sender.phoneJid) return userPartOf(sender.phoneJid);
    return this.phonesByLid.get(sender.jid) ?? sender.jid;
  }

  /**
   * WhatsApp names a sender who hides their number only by LID. The
   * account's LID mapping, kept with the session, often still knows the
   * number; ask it once per LID.
   */
  private async resolvePhone(key: WAMessageKey): Promise<void> {
    const sender = senderOf(key);
    if (sender.phoneJid || !isLidJid(sender.jid)) return;
    if (this.phonesByLid.has(sender.jid)) return;
    const phoneJid = await this.socket?.signalRepository.lidMapping
      .getPNForLID(sender.jid)
      .catch(() => null);
    if (!phoneJid) return;
    rememberBounded(
      this.phonesByLid,
      sender.jid,
      userPartOf(jidNormalizedUser(phoneJid)),
      MAX_REMEMBERED_PHONES,
    );
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
