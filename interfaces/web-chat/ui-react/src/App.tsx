/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./ai-elements/conversation";
import {
  ConfirmationPart,
  GenericDataPart,
  ToolResultPart,
} from "./ai-elements/data-parts";
import { MarkdownResponse } from "./ai-elements/markdown-response";
import { Message, MessageContent } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";

const conversationStorageKey = "brain:web-chat:conversation-id";

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

function getPartData(part: unknown): unknown {
  if (typeof part !== "object" || part === null || !("data" in part)) {
    return undefined;
  }
  return part.data;
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

export function App(): React.ReactElement {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState(() =>
    getBrowserConversationId(),
  );
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
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    id: conversationId,
    transport,
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
  }, []);

  function submitMessage(): void {
    const text = input.trim();
    if (!text || isBusyStatus(status)) return;
    setInput("");
    void sendMessage({ text });
    focusPromptTextarea(promptInputRef.current);
  }

  function startNewConversation(): void {
    const next = createConversationId();
    localStorage.setItem(conversationStorageKey, next);
    setConversationId(next);
    setMessages([]);
    setInput("");
    focusPromptTextarea(promptInputRef.current);
  }

  return (
    <main
      className="web-chat-app"
      data-web-chat-app="true"
      data-web-chat-ui="ai-elements-v0"
      data-conversation-id={conversationId}
      aria-label="Brain chat"
    >
      <header className="web-chat-header">
        <div>
          <h1>Brain Chat</h1>
          <p
            className="web-chat-version"
            data-web-chat-version="ai-elements-v0"
          >
            AI Elements UI
          </p>
        </div>
        <button
          className="web-chat-secondary-action"
          type="button"
          onClick={startNewConversation}
        >
          New conversation
        </button>
      </header>
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Ask this brain for help."
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  <strong>{message.role}</strong>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MarkdownResponse key={index}>
                          {part.text}
                        </MarkdownResponse>
                      );
                    }
                    if (part.type === "data-tool-result") {
                      return (
                        <ToolResultPart key={index} data={getPartData(part)} />
                      );
                    }
                    if (part.type === "data-confirmation") {
                      return (
                        <ConfirmationPart
                          key={index}
                          conversationId={conversationId}
                          data={getPartData(part)}
                        />
                      );
                    }
                    if (part.type.startsWith("data-")) {
                      return (
                        <GenericDataPart
                          key={index}
                          type={part.type}
                          data={getPartData(part)}
                        />
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </ConversationContent>
      </Conversation>
      {status !== "ready" ? (
        <p className="web-chat-status" data-status={status}>
          {status}
        </p>
      ) : null}
      {error ? (
        <div className="web-chat-error" role="alert">
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
          onInput={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!isPlainEnter(event)) return;
            event.preventDefault();
            submitMessage();
          }}
        />
        <PromptInputSubmit
          status={status}
          onStop={stop}
          disabled={!input.trim()}
        />
      </PromptInput>
    </main>
  );
}
