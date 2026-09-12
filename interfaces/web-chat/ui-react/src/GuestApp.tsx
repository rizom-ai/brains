/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  ChatApiError,
  CHAT_CONVERSATION_ID_HEADER,
  readChatProtocolEvents,
  getGuestSourceCards,
  type ChatCard,
  type ChatClient,
  type ChatHistoryMessage,
  type ChatMessageRequest,
  type GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { GuestTranscript } from "./GuestTranscript";
import { GuestBox, type GuestBoxState } from "./GuestBox";
import { createWebChatClient } from "./web-chat-client";
import { openGuestBrowserSession } from "./guest-session";

const locatorKey = "brain-ask-conversation";
const incompleteHistoryNotice =
  "History loaded. The previous answer may still be running or incomplete. Nothing has been replayed; you can reload history later.";
function savedConversations(add?: string, remove?: string): string[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`${locatorKey}-list`) ?? "[]",
    );
    const ids = Array.isArray(value)
      ? value.filter(
          (id): id is string =>
            typeof id === "string" &&
            /^guest-[a-f0-9]{64}$/.test(id) &&
            id !== remove,
        )
      : [];
    if (add && !ids.includes(add)) ids.push(add);
    sessionStorage.setItem(`${locatorKey}-list`, JSON.stringify(ids));
    return ids;
  } catch {
    // Conversation locators are optional; transcripts never enter browser storage.
    return add ? [add] : [];
  }
}
function savedLocator(value?: string): string | undefined {
  try {
    if (value !== undefined) {
      if (value) sessionStorage.setItem(locatorKey, value);
      else sessionStorage.removeItem(locatorKey);
    }
    return sessionStorage.getItem(locatorKey) ?? undefined;
  } catch {
    // Storage can be disabled. Never fall back to persisting transcript text.
    return undefined;
  }
}

export interface GuestBoxCopy {
  title: string;
  notice: string;
  inputHint: string;
  topicsLabel: string;
  topics: string[];
}

export function GuestApp({
  client: suppliedClient,
  box,
  initialDraft = "",
  initialSubmit = false,
}: {
  client?: ChatClient;
  box?: GuestBoxCopy;
  initialDraft?: string;
  initialSubmit?: boolean;
}): ReactElement {
  const [client] = useState(() => suppliedClient ?? createWebChatClient());
  const [session, setSession] = useState<GuestChatSessionResponse>();
  const [id, setId] = useState<string>();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [boxState, setBoxState] = useState<GuestBoxState>("connecting");
  const [earlier, setEarlier] = useState<ChatHistoryMessage[]>([]);
  const [boxNotice, setBoxNotice] = useState<string>();
  const restoredQuestion = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const [status, setStatus] = useState("Connecting…");
  const [busy, setBusy] = useState(true);
  const [conversations, setConversations] = useState<string[]>([]);
  const [pending, setPending] = useState<ChatMessageRequest>();
  const [deleting, setDeleting] = useState(false);
  const [expired, setExpired] = useState(false);
  const lock = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const restoreFocus = useRef(!!box);

  useEffect(() => {
    if (busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    const composer = textarea.current;
    if (!active || active === document.body || composer?.form?.contains(active))
      composer?.focus({ preventScroll: true });
  }, [busy, box]);

  useEffect(() => {
    mounted.current = true;
    const lifetime = new AbortController();
    void (async (): Promise<void> => {
      try {
        const opened = await openGuestBrowserSession(client, lifetime.signal);
        lifetime.signal.throwIfAborted();
        setSession(opened);
        setBoxState(opened.canSend ? "ready" : "unavailable");
        setConversations(savedConversations());
        const locator = savedLocator();
        if (locator) {
          setId(locator);
          let history: ChatHistoryMessage[];
          try {
            history = await client.getMessages(locator);
          } catch (error) {
            lifetime.signal.throwIfAborted();
            if (box && error instanceof ChatApiError && error.status === 404) {
              setBoxState("history-unavailable");
              setStatus(
                "The previous conversation is unavailable. Nothing has been deleted or resent.",
              );
              return;
            }
            throw error;
          }
          lifetime.signal.throwIfAborted();
          setMessages(history);
          restoredQuestion.current = history
            .filter((message) => message.role === "user")
            .at(-1)?.id;
          setConversations(savedConversations(locator));
          if (history.at(-1)?.role === "user") {
            setBoxState("incomplete");
            setStatus(incompleteHistoryNotice);
            return;
          }
        }
        setStatus(
          opened.canSend
            ? "Ready. Only public Brain knowledge is available."
            : "Asking is currently unavailable. You can still read or delete this conversation.",
        );
      } catch {
        // Do not log credentials, locators, messages or transport error objects.
        if (!lifetime.signal.aborted) {
          setBoxState("unavailable");
          setStatus(
            "Guest access or saved history is unavailable. No new question has been sent.",
          );
        }
      } finally {
        if (!lifetime.signal.aborted) {
          lock.current = false;
          setBusy(false);
        }
      }
    })();
    return (): void => {
      mounted.current = false;
      lifetime.abort();
      controller.current?.abort();
    };
  }, [client, box]);

  function remember(locator: string): void {
    setId(locator);
    savedLocator(locator);
    setConversations(savedConversations(locator));
  }

  async function restore(locator: string): Promise<void> {
    if (lock.current || !locator) return;
    lock.current = true;
    setBusy(true);
    try {
      const history = await client.getMessages(locator);
      remember(locator);
      setMessages(history);
      setPending(undefined);
      setDeleting(false);
      setStatus(
        history.at(-1)?.role === "user"
          ? incompleteHistoryNotice
          : "Conversation restored.",
      );
    } catch {
      // Keep the currently visible transcript when a different locator is unavailable.
      setStatus(
        "That conversation is unavailable or expired. Your current view is unchanged.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function send(retry?: ChatMessageRequest): Promise<void> {
    if (lock.current || !session?.canSend) return;
    // The cookie may have changed since an ambiguous first send. Without a
    // server locator, replaying its ID could create a turn for another visitor.
    if (retry && !retry.id) return;
    if (Date.now() >= session.expiresAt) {
      setExpired(true);
      setBoxState("expired");
      setStatus(
        "Your visitor session has expired. Reload to begin a new session.",
      );
      return;
    }
    const text = draft.trim();
    if (!retry && (!text || draft.length > session.messageCharacters)) return;
    const submission = retry ?? {
      ...(id ? { id } : {}),
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          parts: [{ type: "text", text }],
        },
      ],
    };
    lock.current = true;
    setBusy(true);
    setBoxState("sending");
    setBoxNotice(undefined);
    restoreFocus.current = true;
    setPending(submission);
    setStatus("Thinking with public knowledge…");
    setDeleting(false);
    if (!retry) {
      setMessages((previous) => [
        ...previous,
        {
          id: submission.messages[0]?.id ?? crypto.randomUUID(),
          role: "user",
          content: text,
        },
      ]);
      setDraft("");
    }
    const abort = new AbortController();
    controller.current = abort;
    const answerId = crypto.randomUUID();
    let finished = false;
    let locatorReceived = false;
    let responseText = "";
    let responseCards: ChatCard[] = [];
    try {
      const response = await client.streamMessages(submission, {
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      const locator = response.headers.get(CHAT_CONVERSATION_ID_HEADER);
      if (!locator) throw new Error("Missing conversation locator");
      remember(locator);
      locatorReceived = true;
      setBoxState("working");
      setPending({ ...submission, id: locator });
      for await (const event of readChatProtocolEvents(response)) {
        if (abort.signal.aborted) throw new Error("Stopped waiting");
        if (event.type === "error" || event.type === "abort")
          throw new Error("Response unavailable");
        if (event.type === "text-delta") responseText += event.delta;
        if (event.type === "data-sources")
          responseCards = getGuestSourceCards([...responseCards, event.data]);
        if (event.type === "text-delta" || event.type === "data-sources") {
          setMessages((previous) => [
            ...previous.filter((message) => message.id !== answerId),
            {
              id: answerId,
              role: "assistant",
              content: responseText,
              cards: responseCards,
            },
          ]);
        }
        if (event.type === "finish") finished = event.finishReason === "stop";
      }
      if (!finished || !responseText.trim())
        throw new Error("Incomplete response");
      setPending(undefined);
      setBoxState("complete");
      setStatus(
        "Answer received. Check important claims against the original sources.",
      );
    } catch (error) {
      if (error instanceof ChatApiError && error.guestSubmission) {
        const receipt = error.guestSubmission;
        setBoxState("incomplete");
        remember(receipt.conversationId);
        setPending({ ...submission, id: receipt.conversationId });
        setStatus(
          receipt.state === "completed"
            ? "This request already completed. Restoring history…"
            : "This request was already received. It will not be sent again automatically.",
        );
        try {
          const history = await client.getMessages(receipt.conversationId);
          if (receipt.state === "completed") {
            setMessages(history);
            setPending(undefined);
            setBoxState("complete");
            setStatus("Conversation restored.");
          }
          if (receipt.state === "failed" || receipt.state === "interrupted") {
            setPending(undefined);
            setBoxState("ended");
            setStatus(
              "The previous request ended without a complete answer. You may submit a new question.",
            );
          }
        } catch {
          // Preserve the visible question/partial reply when history cannot load.
          setStatus(
            "The request was received, but its conversation is unavailable or expired.",
          );
        }
      } else if (error instanceof ChatApiError && error.status === 429) {
        setBoxState("limit");
        setStatus(
          "A guest limit has been reached, or another request is still running. Nothing will be retried automatically.",
        );
      } else if (!submission.id && !locatorReceived) {
        setBoxState("uncertain");
        setStatus(
          "No conversation locator was received. This tab cannot safely retry or confirm whether the request ran. Your visible question is preserved; nothing will be resent automatically.",
        );
      } else {
        setBoxState("incomplete");
        setStatus(
          abort.signal.aborted
            ? "Stopped waiting. Remote work may still be running; this is not a cancellation guarantee."
            : "The answer is unavailable or incomplete. Your visible text is preserved. Retry checks the same submission, not a new question.",
        );
      }
    } finally {
      lock.current = false;
      controller.current = undefined;
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!id || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await client.deleteSession(id);
      if (!result.deleted) throw new Error("Deletion not acknowledged");
      savedLocator("");
      setConversations(savedConversations(undefined, id));
      setId(undefined);
      setMessages([]);
      setPending(undefined);
      setDeleting(false);
      setStatus(
        "Conversation deleted from this Brain. Provider and backup limitations still apply.",
      );
    } catch {
      // An unavailable record is not an acknowledgement of deletion.
      setStatus(
        "Deletion could not be confirmed. Your visible conversation is preserved.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function checkBoxHistory(): Promise<void> {
    if (!id || lock.current) return;
    lock.current = true;
    setBusy(true);
    setBoxNotice(undefined);
    try {
      const submissionId = pending?.messages[0]?.id;
      const checked = submissionId
        ? await client.getGuestHistory(id, submissionId)
        : undefined;
      const history = checked?.messages ?? (await client.getMessages(id));
      if (!mounted.current) return;
      // Count/text matching cannot identify a submission across tabs. Only an
      // exact receipt, or a stable restored server message ID, can confirm it.
      const restoredIndex = history.findIndex(
        (message) =>
          message.id === restoredQuestion.current && message.role === "user",
      );
      const completed = checked
        ? checked.submission?.conversationId === id &&
          checked.submission.state === "completed"
        : restoredIndex >= 0 &&
          history[restoredIndex + 1]?.role === "assistant";
      if (
        completed &&
        history.some(
          (message) => message.role === "assistant" && message.content.trim(),
        )
      ) {
        setMessages(history);
        setPending(undefined);
        if (history.at(-1)?.role === "user") {
          restoredQuestion.current = history.at(-1)?.id;
          setBoxState("incomplete");
        } else setBoxState("complete");
      } else if (
        checked?.submission?.conversationId === id &&
        ["failed", "interrupted"].includes(checked.submission.state)
      ) {
        setPending(undefined);
        setBoxState("ended");
      } else {
        setBoxNotice(
          completed
            ? "The request completed, but its answer is not available in history. Your visible text is preserved."
            : "No complete answer is confirmed yet. Your question has not been sent again.",
        );
      }
    } catch {
      // Treat failed/cancelled history checks as inconclusive, never as proof
      // that replay is safe. Preserve visible text and hide raw transport errors.
      if (mounted.current)
        setBoxNotice(
          "We couldn’t check the answer. Your visible text is unchanged; nothing was sent again.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function openBoxSession(fresh: boolean): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setBoxNotice(undefined);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const opened = await openGuestBrowserSession(client, abort.signal);
      abort.signal.throwIfAborted();
      if (!mounted.current) return false;
      setSession(opened);
      if (!opened.canSend) {
        setBoxNotice(
          "Chat is still unavailable. Your question has not been sent.",
        );
        return false;
      }
      if (fresh) {
        // Change only the local selection. Never delete, refund, or replay.
        setEarlier((previous) => [...previous, ...messages]);
        setMessages([]);
        setPending(undefined);
        setId(undefined);
        savedLocator("");
        restoredQuestion.current = undefined;
        setExpired(false);
      }
      setBoxState(
        pending && !fresh
          ? pending.id
            ? "incomplete"
            : "uncertain"
          : id && !fresh
            ? messages.at(-1)?.role === "assistant"
              ? "complete"
              : "incomplete"
            : "ready",
      );
      return true;
    } catch {
      // Session and cancellation failures deny sending; raw transport details
      // are not useful recovery instructions and must not replace the draft.
      if (mounted.current)
        setBoxNotice(
          "Chat is unavailable. Your text stays here; nothing was sent.",
        );
      return false;
    } finally {
      lock.current = false;
      controller.current = undefined;
      if (mounted.current) setBusy(false);
    }
  }

  if (box)
    return (
      <GuestBox
        copy={box}
        session={session}
        state={boxState}
        busy={busy}
        messages={messages}
        earlier={earlier}
        draft={draft}
        setDraft={setDraft}
        actionNotice={boxNotice}
        submitOnReady={initialSubmit}
        canSend={
          !!session?.canSend &&
          !expired &&
          !pending &&
          ["ready", "complete", "ended"].includes(boxState)
        }
        canCheck={!!id && ["incomplete", "limit"].includes(boxState)}
        canContinue={
          !busy &&
          !!id &&
          savedLocator() === id &&
          !["history-unavailable", "expired"].includes(boxState)
        }
        onSend={(): void => {
          void send();
        }}
        onCheck={checkBoxHistory}
        onAvailability={async (): Promise<void> => {
          await openBoxSession(false);
        }}
        onFresh={(): Promise<boolean> => openBoxSession(true)}
        onContinue={(): void => {
          if (id) remember(id);
        }}
        onStopWaiting={(): void => controller.current?.abort()}
      />
    );

  return (
    <div className="guest-ask">
      <header className="guest-masthead">
        <a href="/">
          Brain <span>/ Ask</span>
        </a>
        <span>Public knowledge · Private conversation</span>
      </header>
      <main>
        <div className="guest-introduction">
          <p className="guest-eyebrow">A conversation with the Brain</p>
          <h1>
            What would you
            <br />
            like to explore?
          </h1>
          <p>
            Ask about public knowledge, connect ideas, or bring a piece of text
            to think through. This chat cannot edit, publish or administer the
            Brain.
          </p>
        </div>
        {session && (
          <details className="guest-disclosure" open={!messages.length}>
            <summary>Before you ask · privacy and limits</summary>
            <p>{session.notice}</p>
            <p>Provider: {session.provider}</p>
            <p>
              Visitor access expires{" "}
              {new Date(session.expiresAt).toLocaleString()}. Conversation
              retention: idle limit {session.retention.idleSeconds / 3600}{" "}
              hours; maximum age {session.retention.maxAgeSeconds / 3600} hours.
            </p>
            <p>{session.deletionLimitations}</p>
            <p>
              Avoid sensitive material. Your messages are not automatically
              added to the Brain’s knowledge.
            </p>
          </details>
        )}
        {session && (
          <div>
            <nav className="guest-tools" aria-label="Conversation controls">
              <label>
                Conversations in this tab{" "}
                <select
                  aria-label="Previous conversation"
                  value={id ?? ""}
                  disabled={busy}
                  onChange={(event): void => {
                    void restore(event.target.value);
                  }}
                >
                  <option value="">Choose conversation</option>
                  {conversations.map((locator, index) => (
                    <option key={locator} value={locator}>
                      Conversation {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                onClick={(): void => {
                  savedLocator("");
                  setId(undefined);
                  setMessages([]);
                  setPending(undefined);
                  setDeleting(false);
                  setStatus(
                    "New conversation. Previous conversations are not deleted, and running work is not cancelled.",
                  );
                }}
              >
                New conversation
              </button>
              <button
                disabled={!id || busy}
                onClick={(): void => setDeleting(true)}
              >
                Delete conversation
              </button>
              <button
                disabled={!id || busy}
                onClick={(): void => {
                  if (id) void restore(id);
                }}
              >
                Reload history
              </button>
            </nav>
          </div>
        )}
        {deleting && (
          <div className="guest-delete" role="alert">
            <p>
              Delete this conversation from the Brain? This does not erase
              provider records or cancel remote work.
            </p>
            <button
              disabled={busy}
              onClick={(): void => {
                void remove();
              }}
            >
              Confirm deletion
            </button>
            <button disabled={busy} onClick={(): void => setDeleting(false)}>
              Keep conversation
            </button>
          </div>
        )}
        <GuestTranscript messages={messages} />
        <p className="guest-status" role="status" aria-live="polite">
          {status}
        </p>
        {session?.canSend && (
          <form
            onSubmit={(event): void => {
              event.preventDefault();
              void send(pending);
            }}
          >
            <label htmlFor="guest-question">Your question</label>
            <textarea
              ref={textarea}
              id="guest-question"
              value={draft}
              onInput={(event): void => setDraft(event.currentTarget.value)}
              maxLength={session.messageCharacters}
              disabled={busy || !!pending || expired}
              placeholder="Start with a question, an idea, or a passage…"
              rows={4}
            />
            <div className="guest-compose-actions">
              <small>
                {draft.length} / {session.messageCharacters}
              </small>
              {busy ? (
                <button
                  type="button"
                  onClick={(): void => {
                    controller.current?.abort();
                  }}
                >
                  Stop waiting
                </button>
              ) : pending ? (
                <button
                  type="button"
                  disabled={!pending.id}
                  onClick={(): void => {
                    void send(pending);
                  }}
                >
                  {pending.id
                    ? "Check / retry same request"
                    : "Recovery unavailable"}
                </button>
              ) : (
                <button type="submit" disabled={!draft.trim() || expired}>
                  Ask the Brain <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </form>
        )}
      </main>
      <footer>
        Uses public Brain knowledge and the text you share. Answers can be
        mistaken.
      </footer>
    </div>
  );
}
