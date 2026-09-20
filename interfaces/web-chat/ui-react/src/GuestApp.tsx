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
import { GuestPage } from "./GuestPage";
import { GuestBox } from "./GuestBox";
import { createWebChatClient } from "./web-chat-client";
import { openGuestBrowserSession } from "./guest-session";
import { useGuestGate } from "./use-guest-gate";
import { useGuestConversations } from "./use-guest-conversations";
import { useGuestSession } from "./use-guest-session";

const incompleteHistoryNotice =
  "History loaded. The previous answer may still be running or incomplete. Nothing has been replayed; you can reload history later.";

export function GuestApp({
  client: suppliedClient,
  box,
  initialDraft = "",
  initialSubmit = false,
  name = "the Brain",
  siteLabel = "Brain",
}: {
  client?: ChatClient;
  box?: boolean;
  initialDraft?: string;
  initialSubmit?: boolean;
  name?: string;
  siteLabel?: string;
}): ReactElement {
  const [client] = useState(() => suppliedClient ?? createWebChatClient());
  const {
    session,
    expired,
    canSend,
    open: openSession,
    hasElapsed,
    markExpired,
    clearExpired,
  } = useGuestSession({
    open: (signal): Promise<GuestChatSessionResponse> =>
      openGuestBrowserSession(client, signal),
  });
  const {
    id,
    conversations,
    adopt: adoptSavedConversation,
    remember,
    note: noteConversation,
    clear: clearConversation,
    forget: forgetConversation,
    isSaved: isSavedConversation,
  } = useGuestConversations();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [earlier, setEarlier] = useState<ChatHistoryMessage[]>([]);
  const restoredQuestion = useRef<string | undefined>(undefined);
  const gate = useGuestGate();
  const {
    busy,
    status,
    boxState,
    boxNotice,
    setStatus,
    setBoxState,
    setBoxNotice,
    mounted,
  } = gate;
  const [pending, setPending] = useState<ChatMessageRequest>();
  const [deleting, setDeleting] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const conversationMenu = useRef<HTMLDetailsElement>(null);
  function closeConversationMenu(): void {
    if (conversationMenu.current) conversationMenu.current.open = false;
  }
  const followTranscript = useRef(true);

  useEffect(() => {
    if (box || !transcript.current) return;
    if (!messages.length) followTranscript.current = true;
    if (followTranscript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [box, messages]);

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
    void gate.runBoot(async (): Promise<void> => {
      try {
        const opened = await openSession(lifetime.signal);
        lifetime.signal.throwIfAborted();
        setBoxState(opened.canSend ? "ready" : "unavailable");
        const locator = adoptSavedConversation();
        if (locator) {
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
          noteConversation(locator);
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
      }
    });
    return (): void => {
      mounted.current = false;
      lifetime.abort();
      controller.current?.abort();
    };
  }, [client, box]);

  async function restore(locator: string): Promise<void> {
    if (!locator) return;
    await gate.run(
      async (): Promise<void> => {
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
      },
      (): void => {
        // Keep the currently visible transcript when a different locator is unavailable.
        setStatus(
          "That conversation is unavailable or expired. Your current view is unchanged.",
        );
      },
    );
  }

  async function send(retry?: ChatMessageRequest): Promise<void> {
    if (gate.locked() || !canSend || !session) return;
    // The cookie may have changed since an ambiguous first send. Without a
    // server locator, replaying its ID could create a turn for another visitor.
    if (retry && !retry.id) return;
    if (hasElapsed()) {
      markExpired();
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
    await gate.run(async (): Promise<void> => {
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
        controller.current = undefined;
      }
    });
  }

  async function remove(): Promise<void> {
    if (!id) return;
    await gate.run(
      async (): Promise<void> => {
        const result = await client.deleteSession(id);
        if (!result.deleted) throw new Error("Deletion not acknowledged");
        forgetConversation(id);
        setMessages([]);
        setPending(undefined);
        setDeleting(false);
        setStatus(
          "Conversation deleted from this Brain. Provider and backup limitations still apply.",
        );
      },
      (): void => {
        // An unavailable record is not an acknowledgement of deletion.
        setStatus(
          "Deletion could not be confirmed. Your visible conversation is preserved.",
        );
      },
    );
  }

  async function checkBoxHistory(): Promise<void> {
    if (!id) return;
    setBoxNotice(undefined);
    await gate.run(
      async (): Promise<void> => {
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
      },
      (): void => {
        // Treat failed/cancelled history checks as inconclusive, never as proof
        // that replay is safe. Preserve visible text and hide raw transport errors.
        if (mounted.current)
          setBoxNotice(
            "We couldn’t check the answer. Your visible text is unchanged; nothing was sent again.",
          );
      },
    );
  }

  async function openBoxSession(fresh: boolean): Promise<boolean> {
    if (gate.locked()) return false;
    setBoxNotice(undefined);
    const abort = new AbortController();
    controller.current = abort;
    let canSendNow = false;
    await gate.run(async (): Promise<void> => {
      try {
        const opened = await openSession(abort.signal);
        abort.signal.throwIfAborted();
        if (!mounted.current) return;
        if (!opened.canSend) {
          setBoxNotice(
            "Chat is still unavailable. Your question has not been sent.",
          );
          return;
        }
        if (fresh) {
          // Change only the local selection. Never delete, refund, or replay.
          setEarlier((previous) => [...previous, ...messages]);
          setMessages([]);
          setPending(undefined);
          clearConversation();
          restoredQuestion.current = undefined;
          clearExpired();
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
        canSendNow = true;
      } catch {
        // Session and cancellation failures deny sending; raw transport details
        // are not useful recovery instructions and must not replace the draft.
        if (mounted.current)
          setBoxNotice(
            "Chat is unavailable. Your text stays here; nothing was sent.",
          );
      } finally {
        controller.current = undefined;
      }
    });
    return canSendNow;
  }

  if (box)
    return (
      <GuestBox
        copy={{
          title: session?.presentation?.title ?? "",
          notice: session?.presentation?.introduction ?? "",
          topics: session?.presentation?.topics ?? [],
          inputHint: "Start with a question…",
          topicsLabel: "Suggested topics",
        }}
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
          canSend &&
          !pending &&
          ["ready", "complete", "ended"].includes(boxState)
        }
        canCheck={!!id && ["incomplete", "limit"].includes(boxState)}
        canContinue={
          !busy &&
          !!id &&
          isSavedConversation(id) &&
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
    <GuestPage
      name={name}
      siteLabel={siteLabel}
      session={session}
      messages={messages}
      status={status}
      draft={draft}
      conversations={conversations}
      id={id}
      busy={busy}
      pending={pending}
      deleting={deleting}
      expired={expired}
      transcriptRef={transcript}
      textareaRef={textarea}
      conversationMenuRef={conversationMenu}
      followTranscript={followTranscript}
      onRestore={(locator): void => {
        closeConversationMenu();
        void restore(locator);
      }}
      onNewConversation={(): void => {
        closeConversationMenu();
        clearConversation();
        setMessages([]);
        setPending(undefined);
        setDeleting(false);
        setStatus(
          "New conversation. Previous conversations are not deleted, and running work is not cancelled.",
        );
      }}
      onAskDelete={(): void => {
        closeConversationMenu();
        setDeleting(true);
      }}
      onCancelDelete={(): void => setDeleting(false)}
      onConfirmDelete={(): void => {
        void remove();
      }}
      onReloadHistory={(): void => {
        closeConversationMenu();
        if (id) void restore(id);
      }}
      onDraftChange={setDraft}
      onTopic={(topic): void => {
        setDraft(topic);
        textarea.current?.focus();
      }}
      onSubmit={(): void => {
        followTranscript.current = true;
        void send(pending);
      }}
      onStopWaiting={(): void => {
        controller.current?.abort();
      }}
      onRetry={(): void => {
        void send(pending);
      }}
    />
  );
}
