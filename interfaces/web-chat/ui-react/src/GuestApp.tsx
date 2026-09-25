/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  ChatApiError,
  type ChatClient,
  type ChatHistoryMessage,
  type GuestChatSessionResponse,
  type ChatCard,
} from "@brains/contracts/chat";
import { GuestPage } from "./GuestPage";
import { GuestBox } from "./GuestBox";
import { createWebChatClient } from "./web-chat-client";
import { openGuestBrowserSession } from "./guest-session";
import { useGuestGate } from "./use-guest-gate";
import { useGuestConversations } from "./use-guest-conversations";
import { useGuestSession } from "./use-guest-session";
import { useGuestTranscript } from "./use-guest-transcript";
import { useGuestSend } from "./use-guest-send";
import { useGuestHistoryCheck } from "./use-guest-history-check";

const incompleteHistoryNotice =
  "History loaded. The previous answer may still be running or incomplete. Nothing has been replayed; you can reload history later.";

export function GuestApp({
  client: suppliedClient,
  box,
  initialDraft = "",
  initialSubmit = false,
  name = "the Brain",
  siteLabel = "Brain",
  onAnswered,
}: {
  client?: ChatClient;
  box?: boolean;
  initialDraft?: string;
  initialSubmit?: boolean;
  name?: string;
  siteLabel?: string;
  /** Told which sources each completed answer drew on (see mountGuestBox). */
  onAnswered?: (cards: ChatCard[]) => void;
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
  const {
    messages,
    earlier,
    setMessages,
    show: showHistory,
    setAside: setTurnsAside,
    clear: clearTranscript,
    restoredQuestion,
    transcriptRef,
    followTranscript,
  } = useGuestTranscript({ box: !!box });
  const [draft, setDraft] = useState(initialDraft);
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
  const controller = useRef<AbortController | undefined>(undefined);
  const { pending, setPending, send, stopWaiting } = useGuestSend({
    client,
    gate,
    session,
    canSend,
    hasElapsed,
    markExpired,
    conversationId: id,
    remember,
    setMessages,
    showHistory,
    draft,
    setDraft,
    ...(onAnswered ? { onAnswered } : {}),
    onStart: (): void => {
      restoreFocus.current = true;
      setDeleting(false);
    },
    controller,
  });
  const [deleting, setDeleting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const conversationMenu = useRef<HTMLDetailsElement>(null);
  function closeConversationMenu(): void {
    if (conversationMenu.current) conversationMenu.current.open = false;
  }

  const { check: checkBoxHistory } = useGuestHistoryCheck({
    client,
    gate,
    conversationId: id,
    pending,
    clearPending: (): void => setPending(undefined),
    showHistory,
    restoredQuestion,
  });

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
          showHistory(history);
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
        showHistory(history);
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

  async function remove(): Promise<void> {
    if (!id) return;
    await gate.run(
      async (): Promise<void> => {
        const result = await client.deleteSession(id);
        if (!result.deleted) throw new Error("Deletion not acknowledged");
        forgetConversation(id);
        clearTranscript();
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
          setTurnsAside();
          setPending(undefined);
          clearConversation();
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
        onStopWaiting={stopWaiting}
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
      transcriptRef={transcriptRef}
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
        clearTranscript();
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
      onStopWaiting={stopWaiting}
      onRetry={(): void => {
        void send(pending);
      }}
    />
  );
}
