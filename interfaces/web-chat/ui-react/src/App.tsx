/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { type EventChatAction } from "@brains/contracts";
import { Chat, useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
  type UIMessage,
} from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./ai-elements/conversation";
import { Message, MessageContent } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTextarea,
  PromptInputTools,
} from "./ai-elements/prompt-input";
import {
  PromptAttachmentButton,
  PromptAttachmentList,
  PromptSubmitControl,
} from "./components/prompt-controls";
import { MessageSections } from "./components/message-sections";
import { SessionDialog } from "./components/session-dialog";
import { SessionRail } from "./components/session-rail";
import {
  buildConversationJumpGroup,
  parseChatSessionHash,
  type JumpLocalGroup,
} from "./jump-local";
import type { WebChatSession } from "./api";
import { createActiveMessageSeed } from "./history-messages";
import {
  sessionHistoryQueryOptions,
  sessionListQueryOptions,
  webChatKeys,
} from "./queries";
import { runSessionSwitch } from "./session-switch";
import { classifySubmitError, prepareUploadSubmission } from "./uploads";
import {
  webChatUploadAccept,
  webChatUploadMaxBytes,
} from "../../src/upload-policy";
import { getErrorMessage } from "@brains/utils/error";
import {
  getLiveStatusMessage,
  isBusyStatus,
  statusPhrase,
} from "./chat-status";
import {
  createConversationId,
  getBrowserConversationId,
  rememberConversationId,
} from "./conversation-id";
import { focusPromptTextarea, resizePromptTextarea } from "./prompt-textarea";
import {
  consumeInboxChatPrefill,
  withoutInboxChatPrefill,
} from "./inbox-prefill";
import { deriveSessionTitle } from "./session-format";
import { useSessionMutations } from "./use-session-mutations";

type UploadNotice = { tone: "success" | "error"; message: string } | null;

const emptySessions: WebChatSession[] = [];

export function App(): React.ReactElement {
  const [inboxHandoff] = useState(() =>
    consumeInboxChatPrefill(window.history.state, () => {
      window.history.replaceState(
        withoutInboxChatPrefill(
          window.history.state as Record<string, unknown>,
        ),
        "",
        window.location.href,
      );
    }),
  );
  const [input, setInput] = useState(inboxHandoff?.text ?? "");
  const [inboxContext, setInboxContext] = useState(
    inboxHandoff?.context ?? null,
  );
  const [conversationId, setConversationId] = useState(() => {
    if (!inboxHandoff) return getBrowserConversationId();
    const next = createConversationId();
    rememberConversationId(next);
    return next;
  });
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery(sessionListQueryOptions());
  const sessions = sessionsQuery.data ?? emptySessions;
  const sessionError = sessionsQuery.error?.message ?? null;
  const [historyError, setHistoryError] = useState<string | null>(null);
  const startupRestoreAttemptedRef = useRef(inboxHandoff !== undefined);
  const switchRequestIdRef = useRef(0);
  const [loadingConversationId, setLoadingConversationId] = useState<
    string | null
  >(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<UploadNotice>(null);
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(
    null,
  );

  function closeDrawer(): void {
    setDrawerOpen(false);
  }

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
        onData: (part): void => {
          const message = getLiveStatusMessage(part);
          if (message) setLiveStatusMessage(message);
        },
        onError: (): void => {
          setLiveStatusMessage(null);
        },
        onFinish: (): void => {
          setLiveStatusMessage(null);
        },
        sendAutomaticallyWhen:
          lastAssistantMessageIsCompleteWithApprovalResponses,
      }),
    [conversationId, initialMessages, transport],
  );
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
  } = useChat({
    chat,
  });

  function resetToNewConversation(): void {
    switchRequestIdRef.current += 1;
    setLoadingConversationId(null);
    const next = createConversationId();
    rememberConversationId(next);
    setMessages([]);
    setInitialMessages([]);
    setConversationId(next);
    setInput("");
    setInboxContext(null);
  }

  const sessionMutations = useSessionMutations({
    chatIsBusy: isBusyStatus(status),
    activeConversationId: conversationId,
    onActiveSessionRemoved: resetToNewConversation,
    setError: setHistoryError,
    onSettled: () => focusPromptTextarea(promptInputRef.current),
  });

  useEffect(() => {
    if (promptInputRef.current) {
      resizePromptTextarea(promptInputRef.current);
    }
  }, [input]);

  useEffect(() => {
    focusPromptTextarea(promptInputRef.current);
  }, []);

  async function loadSessions(): Promise<void> {
    await sessionsQuery.refetch();
  }

  function upsertPendingSession(text: string): void {
    const now = new Date().toISOString();
    const pendingSession: WebChatSession = {
      id: conversationId,
      title: deriveSessionTitle(text),
      lastActiveAt: now,
    };
    queryClient.setQueryData<WebChatSession[]>(
      webChatKeys.sessions(),
      (cached) => {
        const current = cached ?? emptySessions;
        const existingSession = current.find(
          (session) => session.id === conversationId,
        );
        // A title the operator has already seen wins over a freshly derived
        // one — only the placeholder gets overwritten.
        const nextSession =
          existingSession && existingSession.title !== "New conversation"
            ? { ...existingSession, lastActiveAt: now }
            : pendingSession;
        const withoutCurrent = current.filter(
          (session) => session.id !== conversationId,
        );
        return [nextSession, ...withoutCurrent];
      },
    );
  }

  async function switchConversation(nextConversationId: string): Promise<void> {
    if (isBusyStatus(status) || loadingConversationId) return;

    const switchRequestId = ++switchRequestIdRef.current;
    setHistoryError(null);
    setLoadingConversationId(nextConversationId);
    await runSessionSwitch({
      load: async () => {
        const cachedHistory = await queryClient.fetchQuery({
          ...sessionHistoryQueryOptions(nextConversationId),
          staleTime: 0,
        });
        return createActiveMessageSeed(cachedHistory);
      },
      isCurrent: () => switchRequestId === switchRequestIdRef.current,
      onSuccess: (nextMessages) => {
        rememberConversationId(nextConversationId);
        setMessages(nextMessages);
        setInitialMessages(nextMessages);
        setConversationId(nextConversationId);
        setInput("");
        setInboxContext(null);
        closeDrawer();
        focusPromptTextarea(promptInputRef.current);
      },
      onError: (error) => {
        setHistoryError(
          getErrorMessage(error, "Could not reopen that session."),
        );
      },
      onSettled: () => setLoadingConversationId(null),
    });
  }

  useEffect(() => {
    if (!sessionsQuery.isSuccess || startupRestoreAttemptedRef.current) return;
    startupRestoreAttemptedRef.current = true;

    if (sessions.some((session) => session.id === conversationId)) {
      void switchConversation(conversationId);
    }
  }, [conversationId, sessions, sessionsQuery.isSuccess]);

  async function submitMessage(
    textOverride?: string,
    files: FileUIPart[] = [],
  ): Promise<void> {
    const text = (textOverride ?? input).trim();
    if ((!text && files.length === 0) || isBusyStatus(status)) return;
    setHistoryError(null);

    if (files.length > 0) {
      setUploadNotice({
        tone: "success",
        message: `Uploading ${files.length === 1 ? "attachment" : "attachments"}…`,
      });
    }

    let submission: Awaited<ReturnType<typeof prepareUploadSubmission>>;
    try {
      submission = await prepareUploadSubmission(text, files);
    } catch (error) {
      const effect = classifySubmitError(error, "upload");
      if (effect.uploadNotice) setUploadNotice(effect.uploadNotice);
      setHistoryError(effect.historyError);
      return;
    }

    if (submission.uploadNoticeMessage) {
      setUploadNotice({
        tone: "success",
        message: submission.uploadNoticeMessage,
      });
    } else {
      setUploadNotice(null);
    }

    upsertPendingSession(submission.title);
    setInput("");
    const { payload } = submission;
    void sendMessage(
      payload,
      inboxContext ? { body: { inboxContext } } : undefined,
    )
      .catch((error: unknown) => {
        const effect = classifySubmitError(error, "send");
        if (effect.uploadNotice) setUploadNotice(effect.uploadNotice);
        setHistoryError(effect.historyError);
        if (text) setInput((current) => current || text);
      })
      .finally(() => {
        void queryClient.invalidateQueries({
          queryKey: webChatKeys.history(conversationId),
        });
        void loadSessions();
        focusPromptTextarea(promptInputRef.current);
      });
  }

  async function submitRuntimeEvent(action: EventChatAction): Promise<void> {
    if (isBusyStatus(status)) return;
    setHistoryError(null);

    try {
      const response = await fetch("/api/chat/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: {
            type: "event",
            event: action.event,
            ...(action.fromState ? { fromState: action.fromState } : {}),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Runtime action failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        text?: string;
        cards?: Array<{ kind: string }>;
        toolResults?: unknown[];
      };
      const parts: UIMessage["parts"] = [];
      if (data.text && data.text.trim().length > 0) {
        parts.push({ type: "text", text: data.text });
      }
      for (const toolResult of data.toolResults ?? []) {
        parts.push({ type: "data-tool-result", data: toolResult });
      }
      for (const card of data.cards ?? []) {
        parts.push({
          type:
            card.kind === "sources"
              ? "data-sources"
              : card.kind === "actions"
                ? "data-actions"
                : "data-attachment",
          data: card,
        });
      }
      if (parts.length > 0) {
        setMessages((current) => [
          ...current,
          {
            id: `runtime-${crypto.randomUUID()}`,
            role: "assistant",
            parts,
          },
        ]);
      }
      void queryClient.invalidateQueries({
        queryKey: webChatKeys.history(conversationId),
      });
      void loadSessions();
    } catch (error) {
      const effect = classifySubmitError(error, "send");
      if (effect.uploadNotice) setUploadNotice(effect.uploadNotice);
      setHistoryError(effect.historyError);
    }
  }

  function startNewConversation(): void {
    setHistoryError(null);
    resetToNewConversation();
    closeDrawer();
    focusPromptTextarea(promptInputRef.current);
  }

  // Chat's contribution to the cross-surface ⌘K palette: the endpoint
  // doesn't know this operator's conversations, so they append locally.
  useEffect(() => {
    window.__consoleJumpLocal = (query): JumpLocalGroup[] => {
      const group = buildConversationJumpGroup(sessions, query);
      return group ? [group] : [];
    };
    return (): void => {
      delete window.__consoleJumpLocal;
    };
  }, [sessions]);

  // A conversation door (#s/{id}) — from the palette on any surface —
  // resumes that session and clears the hash.
  useEffect(() => {
    const activateFromHash = (): void => {
      const sessionId = parseChatSessionHash(window.location.hash);
      if (sessionId === null) return;
      window.history.replaceState(null, "", window.location.pathname);
      void switchConversation(sessionId);
    };
    activateFromHash();
    window.addEventListener("hashchange", activateFromHash);
    return (): void =>
      window.removeEventListener("hashchange", activateFromHash);
    // Mount-only by design: doors normally arrive via full navigation.
  }, []);

  function openDialogFromRail(open: (session: WebChatSession) => void) {
    return (session: WebChatSession): void => {
      closeDrawer();
      open(session);
    };
  }

  const activeSessionTitle = sessions.find(
    (session) => session.id === conversationId,
  )?.title;

  return (
    <div
      className="web-chat-shell"
      data-web-chat-app="true"
      data-web-chat-ui="ai-elements-v0"
      data-conversation-id={conversationId}
      data-drawer-open={drawerOpen ? "true" : "false"}
    >
      <div
        className="web-chat-mobile-drawer-scrim"
        aria-hidden="true"
        onClick={closeDrawer}
      />
      <button
        type="button"
        className="web-chat-mobile-drawer-close"
        aria-label="Close sessions"
        onClick={closeDrawer}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      </button>

      {sessionMutations.dialog ? (
        <SessionDialog
          dialog={sessionMutations.dialog}
          renameDraft={sessionMutations.renameDraft}
          renamePending={sessionMutations.renamingConversationId !== null}
          archivePending={sessionMutations.archivingConversationId !== null}
          deletePending={sessionMutations.deletingConversationId !== null}
          onRenameDraftChange={sessionMutations.setRenameDraft}
          onClose={sessionMutations.closeDialog}
          onRename={sessionMutations.renameConversation}
          onArchive={sessionMutations.archiveConversation}
          onDelete={sessionMutations.deleteConversation}
        />
      ) : null}

      <SessionRail
        sessions={sessions}
        isLoading={sessionsQuery.isPending}
        sessionError={sessionError}
        activeConversationId={conversationId}
        loadingConversationId={loadingConversationId}
        deletingConversationId={sessionMutations.deletingConversationId}
        archivingConversationId={sessionMutations.archivingConversationId}
        renamingConversationId={sessionMutations.renamingConversationId}
        chatIsBusy={isBusyStatus(status)}
        onRetry={() => void loadSessions()}
        onSelect={(sessionId) => void switchConversation(sessionId)}
        onNewConversation={startNewConversation}
        onRename={openDialogFromRail(sessionMutations.openRenameDialog)}
        onArchive={openDialogFromRail(sessionMutations.openArchiveDialog)}
        onDelete={openDialogFromRail(sessionMutations.openDeleteDialog)}
      />

      <main className="web-chat-app" aria-label="Brain chat">
        <header className="web-chat-header">
          <button
            type="button"
            className="web-chat-mobile-trigger"
            aria-label="Open sessions"
            aria-expanded={drawerOpen}
            data-active={drawerOpen ? "true" : "false"}
            onClick={() => setDrawerOpen(true)}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <span className="web-chat-header-eyebrow">
              Brain · Chat
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
              {activeSessionTitle ?? (
                <>
                  New <em>conversation</em>
                </>
              )}
            </h1>
            <p>
              {activeSessionTitle
                ? "Active conversation"
                : "A field log for talking with the brain"}
            </p>
          </div>
          <div className="web-chat-header-actions">
            <button
              className="web-chat-mobile-new"
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
          </div>
        </header>

        {historyError ? (
          <div
            className="web-chat-session-notice"
            data-tone="error"
            role="alert"
          >
            <span className="web-chat-session-notice-tag">Session drift</span>
            <p>{historyError}</p>
            <button type="button" onClick={() => setHistoryError(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <Conversation>
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Begin a field note."
                description="Ask the brain about entities, notes, prompts, or recent work — the thread grows from the first message."
              />
            ) : (
              messages.map((message) => (
                <Message
                  key={message.id}
                  from={message.role}
                  data-role={message.role}
                >
                  <div className="web-chat-message-header">
                    {message.role === "user" ? "you" : "brain"}
                  </div>
                  <MessageContent className="web-chat-message-bubble">
                    <MessageSections
                      parts={message.parts}
                      handlers={{
                        addToolApprovalResponse,
                        onPromptAction: (prompt) => void submitMessage(prompt),
                        onEventAction: (action) =>
                          void submitRuntimeEvent(action),
                      }}
                    />
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
        </Conversation>

        {status !== "ready" ? (
          <p className="web-chat-status" data-status={status}>
            <span className="web-chat-status-rail" aria-hidden="true" />
            <span className="web-chat-status-phrase">
              {liveStatusMessage ?? statusPhrase(status)}
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

        {uploadNotice ? (
          <p className="web-chat-file-notice" data-tone={uploadNotice.tone}>
            {uploadNotice.message}
          </p>
        ) : null}

        <PromptInput
          accept={webChatUploadAccept}
          maxFileSize={webChatUploadMaxBytes}
          multiple
          onError={(uploadError) =>
            setUploadNotice({ tone: "error", message: uploadError.message })
          }
          onSubmit={(message) => submitMessage(message.text, message.files)}
        >
          <label htmlFor="web-chat-input">Message</label>
          <PromptInputHeader>
            {inboxContext ? (
              <div className="web-chat-inbox-context" role="status">
                <span
                  className="web-chat-inbox-context-icon"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                  >
                    <rect x="2.25" y="3.5" width="11.5" height="9" rx="1.5" />
                    <path
                      d="m3.25 5 4.75 3.75L12.75 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="web-chat-inbox-context-kicker">Inbox</span>
                <span
                  className="web-chat-inbox-context-divider"
                  aria-hidden="true"
                />
                <span
                  className="web-chat-inbox-context-label"
                  title={inboxContext.label}
                >
                  {inboxContext.label}
                </span>
                <button
                  type="button"
                  aria-label={`Detach Inbox context: ${inboxContext.label}`}
                  title="Remove Inbox context"
                  onClick={() => setInboxContext(null)}
                >
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    aria-hidden="true"
                  >
                    <path d="m3 3 6 6m0-6L3 9" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : null}
            <PromptAttachmentList />
          </PromptInputHeader>
          <PromptInputTextarea
            id="web-chat-input"
            ref={promptInputRef}
            value={input}
            aria-label="Message"
            placeholder="Plant a question…"
            onInput={(event) => setInput(event.currentTarget.value)}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptAttachmentButton />
            </PromptInputTools>
            <PromptSubmitControl input={input} status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </main>
    </div>
  );
}
