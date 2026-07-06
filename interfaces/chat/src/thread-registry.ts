import type { SentMessage } from "chat";
import type { ChatThread } from "./types";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface ThreadEntry {
  expiresAt: number;
  thread: ChatThread;
}

/**
 * Small TTL registry for routing job progress updates back to Chat SDK threads.
 */
export class ThreadRegistry {
  private readonly threads = new Map<string, ThreadEntry>();
  private readonly sentMessages = new Map<string, SentMessage>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  set(thread: ChatThread): void {
    this.cleanup();
    this.threads.set(thread.id, {
      thread,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(threadId: string | null): ChatThread | undefined {
    if (!threadId) return undefined;
    const entry = this.threads.get(threadId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.threads.delete(threadId);
      return undefined;
    }
    entry.expiresAt = Date.now() + this.ttlMs;
    return entry.thread;
  }

  trackMessage(channelId: string, message: SentMessage): void {
    this.sentMessages.set(this.messageKey(channelId, message.id), message);
  }

  getMessage(
    channelId: string | null,
    messageId: string,
  ): SentMessage | undefined {
    if (!channelId) return undefined;
    return this.sentMessages.get(this.messageKey(channelId, messageId));
  }

  clear(): void {
    this.threads.clear();
    this.sentMessages.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [threadId, entry] of this.threads) {
      if (entry.expiresAt <= now) {
        this.threads.delete(threadId);
      }
    }
  }

  private messageKey(channelId: string, messageId: string): string {
    return `${channelId}:${messageId}`;
  }
}
