import {
  getToolStatusDisplay,
  getToolStatusKey,
  type ToolStatusUpdate,
} from "@brains/plugins";
import type { CardChild, CardElement, SentMessage } from "chat";
import type { ThreadRegistry } from "./thread-registry";

/**
 * Owns the lifecycle of per-tool status cards in a chat thread: posts a card
 * when a tool starts running, then edits/finalizes it on completion. Tracks the
 * sent messages by status key so a later update targets the right card.
 *
 * Extracted from ChatInterface to keep that class focused on plugin lifecycle
 * and routing rather than tool-status card bookkeeping.
 */
export class ToolStatusMessenger {
  private readonly messages = new Map<
    string,
    { channelId: string; message: SentMessage }
  >();

  constructor(private readonly threadRegistry: ThreadRegistry) {}

  /** Drop all tracked status messages (called on interface shutdown). */
  clear(): void {
    this.messages.clear();
  }

  async handle(update: ToolStatusUpdate): Promise<void> {
    const key = getToolStatusKey(update);
    if (update.state === "running") {
      await this.send(key, update);
      return;
    }
    await this.update(key, update);
  }

  private async send(key: string, update: ToolStatusUpdate): Promise<void> {
    const channelId = update.channelId;
    if (!channelId) return;
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;

    const sent = await thread.post(formatToolStatusPayload(update));
    this.threadRegistry.trackMessage(channelId, sent);
    this.messages.set(key, { channelId, message: sent });
  }

  private async update(key: string, update: ToolStatusUpdate): Promise<void> {
    const payload = formatToolStatusPayload(update);
    const tracked = this.messages.get(key);
    if (tracked) {
      const edited = await tracked.message.edit(payload);
      this.threadRegistry.trackMessage(tracked.channelId, edited);
      this.messages.delete(key);
      return;
    }

    const channelId = update.channelId;
    if (!channelId) return;
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;
    const sent = await thread.post(payload);
    this.threadRegistry.trackMessage(channelId, sent);
  }
}

function formatToolStatusPayload(update: ToolStatusUpdate): {
  card: CardElement;
  fallbackText: string;
} {
  const display = getToolStatusDisplay(update);
  const children: CardChild[] = [{ type: "text", content: display.label }];
  if (update.error) {
    children.push({ type: "text", content: update.error });
  }
  return {
    card: {
      type: "card",
      title: display.title,
      children,
    },
    fallbackText: display.fallback,
  };
}
