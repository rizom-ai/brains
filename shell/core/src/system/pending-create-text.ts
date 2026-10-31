import type { CreateQuestion } from "@brains/entity-service";
import type { z } from "@brains/utils/zod";
import type { createInputSchema } from "./schemas";

type CreateSource = z.infer<typeof createInputSchema>["source"];

/** The text a create was given when its type asked the user a question. */
interface PendingText {
  /** The confirmed source, frozen to its message and content hash. */
  source: CreateSource;
  content: string;
  question: CreateQuestion;
  expiresAt: number;
}

/** What a retry's source resolved to. */
export interface RetrySource {
  source: CreateSource;
  content: string | undefined;
  resolvedMessageId: string | undefined;
}

export type RetryResolution =
  /** Save the pinned original: its bytes and its frozen source. */
  | { kind: "pinned"; source: CreateSource; content: string }
  /** Save what the retry names. */
  | { kind: "as-given" };

const PIN_LIFETIME_MS = 30 * 60 * 1000;

/** Slide separators a writer adds when told where a deck's slides break. */
const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/gm;

function words(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pinnedMessageId(source: CreateSource): string | undefined {
  return source.kind === "user-message" ? source.messageId : undefined;
}

/**
 * Verbatim text survives a clarifying question. When a type refuses a
 * create to ask the user something (a project's year, a doc's section,
 * where a deck's slides break), the text it was given is pinned per
 * conversation and type. The retry after the answer saves those bytes,
 * whatever the model resends: its own copy of the text, or the latest
 * message, which holds the answer. Only new text the user pastes, or
 * separators added after a slide-break question, replace the original.
 */
export class PendingCreateTexts {
  private readonly pins = new Map<string, PendingText>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  pin(key: string, pending: Omit<PendingText, "expiresAt">): void {
    this.pins.set(key, {
      ...pending,
      expiresAt: this.now() + PIN_LIFETIME_MS,
    });
  }

  clear(key: string): void {
    this.pins.delete(key);
  }

  private live(key: string): PendingText | undefined {
    const pending = this.pins.get(key);
    if (pending && pending.expiresAt < this.now()) {
      this.pins.delete(key);
      return undefined;
    }
    return pending;
  }

  /**
   * A retry whose boundaries only fit the original message: the latest
   * message, which holds the answer, does not contain them. Save the
   * original instead of failing the retry.
   */
  resolveUnresolvable(
    key: string,
    source: CreateSource,
  ): Extract<RetryResolution, { kind: "pinned" }> | undefined {
    const pending = this.live(key);
    if (!pending || source.kind !== "user-message" || source.messageId) {
      return undefined;
    }
    return { kind: "pinned", source: pending.source, content: pending.content };
  }

  resolve(key: string, retry: RetrySource): RetryResolution {
    const pending = this.live(key);
    if (!pending) return { kind: "as-given" };

    const pinnedId = pinnedMessageId(pending.source);
    const pinned: RetryResolution = {
      kind: "pinned",
      source: pending.source,
      content: pending.content,
    };

    if (retry.source.kind === "user-message" && retry.source.messageId) {
      // A message the model names: the original, or new text the user pasted.
      if (retry.source.messageId !== pinnedId) this.pins.delete(key);
      return { kind: "as-given" };
    }
    if (retry.content === undefined) return { kind: "as-given" };
    if (
      pending.question === "slide-breaks" &&
      retry.content !== pending.content &&
      words(retry.content.replace(SEPARATOR_LINE, "")) ===
        words(pending.content)
    ) {
      return { kind: "as-given" };
    }
    if (retry.source.kind === "text") return pinned;
    if (
      retry.source.kind === "user-message" &&
      retry.resolvedMessageId !== pinnedId
    ) {
      // The latest message: the user's short answer, or new text they pasted.
      if (retry.content.length * 2 < pending.content.length) return pinned;
      this.pins.delete(key);
    }
    return { kind: "as-given" };
  }
}

/** Pins are kept per conversation and entity type. */
export function pendingCreateKey(
  conversation: string | undefined,
  entityType: string,
): string | undefined {
  return conversation ? `${conversation}\u0000${entityType}` : undefined;
}

/** The source a model passes to save the pinned text again, without internal fields. */
export function retrySourceHint(source: CreateSource): CreateSource {
  if (source.kind !== "user-message") return source;
  const { contentHash: _hash, ...hint } = source;
  return hint;
}
