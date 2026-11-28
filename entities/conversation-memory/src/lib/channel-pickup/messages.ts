import {
  conversationMessageMetadataSchema,
  type ConversationMessageActor,
  type Message,
} from "@brains/sdk/internal/service-runtime";

/** A message with its 1-based position in its conversation. */
export interface PositionedMessage {
  position: number;
  message: Message;
  /**
   * Part of a conversation with the brain: a request to it or its answer.
   * The brain acts on those itself, so nothing is picked up from them.
   */
  withBrain?: boolean | undefined;
}

/** A speaker as the model is shown them: a reference (p1, p2…) and a name. */
export interface Speaker {
  ref: string;
  label: string;
}

/** A message's day as the model reads it: weekday and date, e.g. "Fri 2026-10-23". */
export function dayOf(timestamp: string): string | undefined {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${date.toISOString().slice(0, 10)}`;
}

/** The one day all the messages were written on, if there is one. */
export function singleDay(messages: PositionedMessage[]): string | undefined {
  const days = new Set(messages.map(({ message }) => dayOf(message.timestamp)));
  const [day] = days;
  return days.size === 1 ? day : undefined;
}

export function actorOf(
  message: Message,
): ConversationMessageActor | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(message.metadata);
  return parsed.success ? parsed.data.actor : undefined;
}

export function speakerKey(message: Message): string {
  const actor = actorOf(message);
  if (!actor) return `role:${message.role}`;
  const { identity } = actor;
  if (identity.kind === "user") return `user:${identity.userId}`;
  if (identity.kind === "external") return identity.externalActorId;
  return JSON.stringify(identity);
}

export function labelOf(message: Message): string {
  const actor = actorOf(message);
  return (
    [actor?.displayName, actor?.username]
      .map((value) => value?.trim())
      .find((value): value is string => !!value) ?? message.role
  );
}

/** The chat app's own id of a stored message, to pin it there. */
export function chatMessageIdOf(message: Message): string | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(message.metadata);
  return parsed.success ? parsed.data.source?.messageId : undefined;
}

/**
 * The message position in the id of something the pickup made, when the id
 * opens with the prefix its kind gives a conversation: "<prefix>12-1" is
 * from message 12.
 */
export function sourcePositionOf(
  id: string,
  prefix: string,
): number | undefined {
  if (!id.startsWith(prefix)) return undefined;
  const position = Number(id.slice(prefix.length).split("-")[0]);
  return Number.isInteger(position) ? position : undefined;
}

/** A title as a key, so the same thing worded the same way is found twice. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The messages as numbered lines, each with its speaker, dated when asked. */
export function formatLines(
  messages: PositionedMessage[],
  speakers: ReadonlyMap<string, Speaker>,
  datedLines: boolean,
): string {
  if (messages.length === 0) return "(none)";
  return messages
    .map(({ position, message, withBrain }) => {
      const speaker = speakers.get(speakerKey(message));
      const day = datedLines ? dayOf(message.timestamp) : undefined;
      return `${position}. ${day ? `[${day}] ` : ""}${speaker?.label ?? message.role} (${speaker?.ref ?? "?"})${withBrain ? " [with the brain]" : ""}: ${message.content}`;
    })
    .join("\n");
}
