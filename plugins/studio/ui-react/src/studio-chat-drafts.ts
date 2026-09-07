import type { ChatUploadResponse } from "@brains/contracts/chat";
import { STUDIO_CHAT_ROUTE_PATH } from "../../src/chat-workspace";

export interface StudioChatDraft {
  readonly text: string;
  readonly uploads: ChatUploadResponse[];
}
export interface StudioChatNavigationState {
  readonly hasDraft: boolean;
  readonly busy: boolean;
}
export function shouldBlockChatNavigation(
  state: StudioChatNavigationState,
  nextPath: string,
): boolean {
  return state.busy || (state.hasDraft && nextPath !== STUDIO_CHAT_ROUTE_PATH);
}
const EMPTY: StudioChatDraft = { text: "", uploads: [] };
export function studioChatDraftKey(
  apiPath: string | undefined,
  sessionId: string | null,
): string {
  return JSON.stringify([apiPath ?? "/api/chat", sessionId]);
}

/** Private to one mounted Studio app. Never writes prompts or upload references to storage. */
export class StudioChatDraftStore {
  private readonly drafts = new Map<string, StudioChatDraft>();
  private readonly listeners = new Set<() => void>();
  hasDrafts = (): boolean => this.drafts.size > 0;
  read(key: string): StudioChatDraft {
    return this.drafts.get(key) ?? EMPTY;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  update(key: string, patch: Partial<StudioChatDraft>): void {
    const next = { ...this.read(key), ...patch };
    if (next.text || next.uploads.length) this.drafts.set(key, next);
    else this.drafts.delete(key);
    this.notify();
  }
  adopt(from: string, to: string): void {
    if (from === to || this.drafts.has(to)) return;
    const draft = this.read(from);
    if (draft.text || draft.uploads.length) this.drafts.set(to, draft);
    this.drafts.delete(from);
    this.notify();
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
