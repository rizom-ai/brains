/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./ai-elements/conversation";
import {
  ConfirmationPart,
  GenericDataPart,
  ToolCallsGroup,
  ToolResultPart,
} from "./ai-elements/data-parts";
import { MarkdownResponse } from "./ai-elements/markdown-response";
import { Message, MessageBubble, MessageHeader } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputHint,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";

const conversationStorageKey = "brain:web-chat:conversation-id";
const dayMs = 24 * 60 * 60 * 1000;
const sessionTitleMaxLength = 48;

interface WebChatSession {
  id: string;
  title: string;
  lastActiveAt: string;
}

interface WebChatHistoryMessage {
  id: string;
  role: UIMessage["role"];
  content: string;
}

interface WebChatSessionsResponse {
  sessions: WebChatSession[];
}

interface WebChatMessagesResponse {
  messages: WebChatHistoryMessage[];
}

function createConversationId(): string {
  return `web-${crypto.randomUUID()}`;
}

function getBrowserConversationId(): string {
  try {
    const stored = localStorage.getItem(conversationStorageKey);
    if (stored) return stored;
    const next = createConversationId();
    localStorage.setItem(conversationStorageKey, next);
    return next;
  } catch {
    return createConversationId();
  }
}

function toUiMessage(message: WebChatHistoryMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

function getPartData(part: unknown): unknown {
  if (typeof part !== "object" || part === null || !("data" in part)) {
    return undefined;
  }
  return part.data;
}

type MessagePart = UIMessage["parts"][number];
type RenderedPart =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: unknown[] }
  | { kind: "confirmation"; data: unknown }
  | { kind: "generic"; type: string; data: unknown };

function groupMessageParts(parts: readonly MessagePart[]): RenderedPart[] {
  const out: RenderedPart[] = [];
  let toolRun: unknown[] = [];
  const flush = (): void => {
    if (toolRun.length === 0) return;
    out.push({ kind: "tools", tools: toolRun });
    toolRun = [];
  };
  for (const part of parts) {
    if (part.type === "data-tool-result") {
      toolRun.push(getPartData(part));
      continue;
    }
    flush();
    if (part.type === "text") {
      out.push({ kind: "text", text: part.text });
    } else if (part.type === "data-confirmation") {
      out.push({ kind: "confirmation", data: getPartData(part) });
    } else if (part.type.startsWith("data-")) {
      out.push({ kind: "generic", type: part.type, data: getPartData(part) });
    }
  }
  flush();
  return out;
}

function isBusyStatus(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

function resizePromptTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function focusPromptTextarea(textarea: HTMLTextAreaElement | null): void {
  requestAnimationFrame(() => textarea?.focus());
}

function isPlainEnter(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}

function deriveSessionTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine) return "New conversation";
  if (firstLine.length <= sessionTitleMaxLength) return firstLine;
  return `${firstLine.slice(0, sessionTitleMaxLength - 1).trimEnd()}…`;
}

function formatSessionTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";
  const diff = now.getTime() - then.getTime();
  if (diff < dayMs && then.getDate() === now.getDate()) {
    return then.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now.getTime() - dayMs);
  if (then.getDate() === yesterday.getDate()) return "Yest";
  if (diff < 7 * dayMs) {
    return then.toLocaleDateString(undefined, { weekday: "short" });
  }
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function statusPhrase(status: string): string {
  if (status === "submitted") return "the rhizome is listening";
  if (status === "streaming") return "the rhizome is listening";
  if (status === "error") return "a thread broke mid-growth";
  return "";
}

export function App(): React.ReactElement {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState(() =>
    getBrowserConversationId(),
  );
  const [sessions, setSessions] = useState<WebChatSession[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
      }),
    [],
  );
  const chat = useMemo(
    () =>
      new Chat<UIMessage>({
        id: conversationId,
        messages: initialMessages,
        transport,
      }),
    [conversationId, initialMessages, transport],
  );
  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    chat,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [messages, status]);

  useEffect(() => {
    if (promptInputRef.current) {
      resizePromptTextarea(promptInputRef.current);
    }
  }, [input]);

  useEffect(() => {
    focusPromptTextarea(promptInputRef.current);
    void loadSessions();
  }, []);

  async function loadSessions(): Promise<void> {
    const response = await fetch("/api/chat/sessions", {
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as WebChatSessionsResponse;
    setSessions(body.sessions);
  }

  function upsertPendingSession(text: string): void {
    const now = new Date().toISOString();
    const pendingSession: WebChatSession = {
      id: conversationId,
      title: deriveSessionTitle(text),
      lastActiveAt: now,
    };
    setSessions((current) => {
      const existingSession = current.find(
        (session) => session.id === conversationId,
      );
      const nextSession =
        existingSession && existingSession.title !== "New conversation"
          ? { ...existingSession, lastActiveAt: now }
          : pendingSession;
      const withoutCurrent = current.filter(
        (session) => session.id !== conversationId,
      );
      return [nextSession, ...withoutCurrent];
    });
  }

  async function switchConversation(nextConversationId: string): Promise<void> {
    const response = await fetch(
      `/api/chat/messages?id=${encodeURIComponent(nextConversationId)}`,
      { credentials: "include" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as WebChatMessagesResponse;
    const nextMessages = body.messages.map(toUiMessage);
    localStorage.setItem(conversationStorageKey, nextConversationId);
    setInitialMessages(nextMessages);
    setConversationId(nextConversationId);
    setInput("");
    focusPromptTextarea(promptInputRef.current);
  }

  function submitMessage(): void {
    const text = input.trim();
    if (!text || isBusyStatus(status)) return;
    upsertPendingSession(text);
    setInput("");
    void sendMessage({ text }).finally(() => loadSessions());
    focusPromptTextarea(promptInputRef.current);
  }

  function startNewConversation(): void {
    const next = createConversationId();
    localStorage.setItem(conversationStorageKey, next);
    setInitialMessages([]);
    setConversationId(next);
    setInput("");
    focusPromptTextarea(promptInputRef.current);
  }

  return (
    <div
      className="web-chat-shell"
      data-web-chat-app="true"
      data-web-chat-ui="ai-elements-v0"
      data-conversation-id={conversationId}
    >
      <aside className="web-chat-sessions" aria-label="Sessions">
        <header className="web-chat-sessions-header">
          <h2>Sessions</h2>
          <button
            className="web-chat-sessions-new"
            type="button"
            aria-label="New conversation"
            onClick={startNewConversation}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {sessions.length === 0 ? (
          <p className="web-chat-sessions-list-empty">No traces yet.</p>
        ) : (
          <ul className="web-chat-sessions-list" role="listbox">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  className="web-chat-session"
                  type="button"
                  role="option"
                  aria-selected={session.id === conversationId}
                  data-active={session.id === conversationId ? "true" : "false"}
                  onClick={() => void switchConversation(session.id)}
                >
                  <span className="web-chat-session-time">
                    {formatSessionTime(session.lastActiveAt)}
                  </span>
                  <div className="web-chat-session-body">
                    <h3 className="web-chat-session-title">{session.title}</h3>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="web-chat-sessions-footer">
          <span className="web-chat-sessions-footer-id">brain · anchor</span>
        </footer>
      </aside>

      <main className="web-chat-app" aria-label="Brain chat">
        <header className="web-chat-header">
          <div>
            <span className="web-chat-header-eyebrow">
              Anchor
              {messages.length > 0 ? (
                <>
                  {" · "}
                  <strong>
                    {messages.length} message{messages.length === 1 ? "" : "s"}
                  </strong>
                </>
              ) : null}
            </span>
            <h1>
              Brain <em>Chat</em>
            </h1>
            <p>A field log for talking with the rhizome.</p>
          </div>
          <button
            className="web-chat-secondary-action"
            type="button"
            onClick={startNewConversation}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            New
          </button>
        </header>

        <Conversation>
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                eyebrow="No traces yet"
                title="Begin a field note."
                description="Ask the brain about entities, notes, prompts, or recent work — the thread grows from the first message."
              />
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageHeader role={message.role} />
                  <MessageBubble>
                    {groupMessageParts(message.parts).map((group, index) => {
                      if (group.kind === "text") {
                        return (
                          <MarkdownResponse key={index}>
                            {group.text}
                          </MarkdownResponse>
                        );
                      }
                      if (group.kind === "tools") {
                        if (group.tools.length === 1) {
                          return (
                            <ToolResultPart key={index} data={group.tools[0]} />
                          );
                        }
                        return (
                          <ToolCallsGroup key={index} tools={group.tools} />
                        );
                      }
                      if (group.kind === "confirmation") {
                        return (
                          <ConfirmationPart
                            key={index}
                            conversationId={conversationId}
                            data={group.data}
                          />
                        );
                      }
                      return (
                        <GenericDataPart
                          key={index}
                          type={group.type}
                          data={group.data}
                        />
                      );
                    })}
                  </MessageBubble>
                </Message>
              ))
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </ConversationContent>
        </Conversation>

        {status !== "ready" ? (
          <p className="web-chat-status" data-status={status}>
            <span className="web-chat-status-rail" aria-hidden="true" />
            <span className="web-chat-status-phrase">
              {statusPhrase(status)}
            </span>
            <span className="web-chat-status-meta">{status}</span>
          </p>
        ) : null}

        {error ? (
          <div className="web-chat-error" role="alert">
            <span className="web-chat-error-tag">[ signal lost ]</span>
            <p>{error.message}</p>
            <button type="button" onClick={clearError}>
              Dismiss
            </button>
          </div>
        ) : null}

        <PromptInput onSubmit={submitMessage}>
          <label htmlFor="web-chat-input">Message</label>
          <PromptInputTextarea
            id="web-chat-input"
            ref={promptInputRef}
            value={input}
            placeholder="Plant a question…"
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!isPlainEnter(event)) return;
              event.preventDefault();
              submitMessage();
            }}
          />
          <PromptInputFooter>
            <PromptInputHint />
            <PromptInputSubmit
              status={status}
              onStop={stop}
              disabled={!input.trim()}
            />
          </PromptInputFooter>
        </PromptInput>
      </main>
    </div>
  );
}
