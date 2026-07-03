import { createPrefixedId } from "@brains/utils/id";

export interface PromptAction {
  threadId: string;
  label: string;
  prompt: string;
}

/**
 * Single-use tokens for suggested prompt actions rendered on cards.
 *
 * Tokens are consumed on click; the store is bounded so never-clicked
 * tokens can't grow unbounded over the process lifetime.
 */
export class PromptActionStore {
  private readonly actions = new Map<string, PromptAction>();

  constructor(private readonly maxEntries = 1000) {}

  register(
    threadId: string,
    action: { label: string; prompt: string },
  ): string {
    const token = createPrefixedId("action");
    this.actions.set(token, { threadId, ...action });
    // Map keeps insertion order, so evicting the first key drops the oldest.
    while (this.actions.size > this.maxEntries) {
      const oldest = this.actions.keys().next().value;
      if (oldest === undefined) break;
      this.actions.delete(oldest);
    }
    return token;
  }

  get(token: string): PromptAction | undefined {
    return this.actions.get(token);
  }

  /** Single-use — consume the token so it can't be replayed. */
  consume(token: string): void {
    this.actions.delete(token);
  }

  get size(): number {
    return this.actions.size;
  }
}
