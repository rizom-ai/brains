/** @jsxImportSource react */
import { libraryStyles as library } from "./studio-library.styles";
import { StudioChatSessionRename } from "./studio-chat-session-rename";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  useAppFetch,
} from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import {
  StudioChatDraftStore,
  studioChatDraftKey,
  type StudioChatNavigationState,
} from "./studio-chat-drafts";
import {
  createChatClient,
  type ChatSession,
  type ChatUploadResponse,
} from "@brains/contracts/chat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
} from "react";
import { STUDIO_CHAT_WORKSPACE_ID } from "../../src/chat-workspace";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { StudioChatHandoff } from "./operator-launch";
import { streamAssistantMessage } from "./chat-workspace-model";
import { TypeSwitcher } from "./entity-fields";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { CHAT_UPLOAD_GUIDANCE, studioChatKeys } from "./studio-chat-contracts";
import { SessionRail } from "./studio-chat-rail";
import { ChatEmptyState, ChatTurn, ApprovalCard } from "./studio-chat-thread";
import { Composer } from "./studio-chat-composer";
import { ConversationContext } from "./studio-chat-context-panel";
import { errorMessage } from "./studio-chat-errors";
import { useChatSessions } from "./use-chat-sessions";
import { useChatStream } from "./use-chat-stream";
import { useChatThreadScroll } from "./use-chat-thread-scroll";
import { useChatUploads } from "./use-chat-uploads";

export interface StudioChatWorkspaceProps {
  apiPath?: string | undefined;
  draftStore?: StudioChatDraftStore | undefined;
  onNavigationStateChange?:
    ((state: StudioChatNavigationState) => void) | undefined;
  studioBasePath: string;
  sessionId: string | null;
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  handoff: StudioChatHandoff | null;
  navigate: (href: string, options?: { preserveWork?: boolean }) => void;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
}

export function StudioChatWorkspace(
  props: StudioChatWorkspaceProps,
): ReactElement {
  const queryClient = useQueryClient();
  const appFetch = useAppFetch();
  const chatClient = useMemo(
    () => createChatClient({ apiPath: props.apiPath, fetch: appFetch }),
    [props.apiPath, appFetch],
  );
  const [localDraftStore] = useState(() => new StudioChatDraftStore());
  const draftStore = props.draftStore ?? localDraftStore;
  const draftKey = studioChatDraftKey(props.apiPath, props.sessionId);
  const currentDraftKey = useRef(draftKey);
  currentDraftKey.current = draftKey;
  const { text: draft, uploads } = useSyncExternalStore(
    draftStore.subscribe,
    () => draftStore.read(draftKey),
    () => draftStore.read(draftKey),
  );
  const setDraft = useCallback(
    (text: string) => draftStore.update(draftKey, { text }),
    [draftStore, draftKey],
  );
  const setUploads = useCallback(
    (
      value:
        | ChatUploadResponse[]
        | ((current: ChatUploadResponse[]) => ChatUploadResponse[]),
    ) =>
      draftStore.update(draftKey, {
        uploads:
          typeof value === "function"
            ? value(draftStore.read(draftKey).uploads)
            : value,
      }),
    [draftStore, draftKey],
  );
  const [archiving, setArchiving] = useState(false);
  const {
    uploading,
    uploadAttempts,
    runUploads,
    uploadFiles,
    dismissAttempt,
    reset: resetUploads,
  } = useChatUploads({ chatClient, draftKey, currentDraftKey, setUploads });
  const navigationCollapsed = useStudioNavigationCollapsed();
  const {
    sessions,
    currentSession,
    archivedSession,
    sessionControls,
    sessionsLoading,
    navigateToSession,
    sessionPickerOpen,
    setSessionPickerOpen,
    detailsOpen,
    setDetailsOpen,
    closeDisclosures,
  } = useChatSessions({
    chatClient,
    queryClient,
    sessionId: props.sessionId,
    studioBasePath: props.studioBasePath,
    navigate: props.navigate,
  });
  const detailsTrigger = useRef<HTMLSpanElement>(null);
  const sessionPickerTrigger = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);
  const handledHandoffRef = useRef<string | null>(null);
  const adoptedSessionRef = useRef<string | null>(null);
  const {
    pendingMessages,
    stream,
    sending,
    error,
    interrupted,
    setSending,
    setError,
    submitPrompt,
    respondToApproval,
    runSuggestedAction,
    hasActiveStream,
    stopActiveStream,
    abortActiveStream,
    reset: resetStream,
  } = useChatStream({
    chatClient,
    queryClient,
    sessionId: props.sessionId,
    apiPath: props.apiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    adoptedSessionRef,
    uploads,
    uploading,
    uploadAttemptCount: uploadAttempts.length,
    navigateToSession,
  });
  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      abortActiveStream();
    };
  }, [abortActiveStream]);
  useEffect(() => {
    props.onNavigationStateChange?.({
      hasDraft: Boolean(draft || uploads.length || uploadAttempts.length),
      busy: sending || uploading,
    });
  }, [
    draft,
    uploads,
    uploadAttempts,
    sending,
    uploading,
    props.onNavigationStateChange,
  ]);
  useEffect(
    () => (): void =>
      props.onNavigationStateChange?.({ hasDraft: false, busy: false }),
    [props.onNavigationStateChange],
  );

  const messagesQuery = useQuery({
    queryKey: studioChatKeys.messages(props.sessionId ?? ""),
    queryFn: () => chatClient.getMessages(props.sessionId ?? ""),
    // A newly accepted session already has an optimistic copy of its first
    // turn. Wait for the completed stream to replace that copy atomically.
    enabled:
      props.sessionId !== null && !sending && pendingMessages.length === 0,
  });
  const storedMessages = messagesQuery.data ?? [];
  const visibleMessages = useMemo(() => {
    const next = [...storedMessages, ...pendingMessages];
    if (stream && (stream.text || stream.cards.length > 0)) {
      next.push(streamAssistantMessage(stream));
    }
    return next;
  }, [pendingMessages, storedMessages, stream]);
  const contextCards = useMemo(
    () =>
      visibleMessages.flatMap((message) =>
        (message.cards ?? []).filter(
          (card) => card.kind === "sources" || card.kind === "attachment",
        ),
      ),
    [visibleMessages],
  );
  const { threadScrollRef, onThreadScroll, showJumpToLatest, jumpToLatest } =
    useChatThreadScroll({
      sessionId: props.sessionId,
      contentKey: `${visibleMessages.length}:${stream?.text.length ?? -1}`,
    });

  useEffect(() => {
    closeDisclosures();
    if (props.sessionId && adoptedSessionRef.current === props.sessionId) {
      adoptedSessionRef.current = null;
      return;
    }
    resetStream();
    resetUploads();
    setArchiving(false);
  }, [props.sessionId]);

  useEffect(() => {
    if (!props.handoff || props.sessionId) return;
    const handoffKey = `${props.handoff.sourceId}\u0000${props.handoff.itemId}`;
    if (handledHandoffRef.current === handoffKey) return;
    handledHandoffRef.current = handoffKey;
    setDraft(props.handoff.prompt);
    setError(null);
    void chatClient
      .openContextSession({
        version: 1,
        sourceId: props.handoff.sourceId,
        itemId: props.handoff.itemId,
        titleSeed: props.handoff.label,
      })
      .then(({ conversationId }) => {
        if (
          !mountedRef.current ||
          currentDraftKey.current !== draftKey ||
          handledHandoffRef.current !== handoffKey
        )
          return;
        draftStore.adopt(
          draftKey,
          studioChatDraftKey(props.apiPath, conversationId),
        );
        navigateToSession(conversationId, true);
      })
      .catch((cause: unknown) => {
        if (
          !mountedRef.current ||
          currentDraftKey.current !== draftKey ||
          handledHandoffRef.current !== handoffKey
        )
          return;
        handledHandoffRef.current = null;
        setError(errorMessage(cause, "Context could not be attached"));
      });
  }, [
    chatClient,
    navigateToSession,
    props.handoff,
    props.sessionId,
    props.apiPath,
    draftStore,
    draftKey,
    setDraft,
  ]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submitPrompt(draft);
  };

  const archiveCurrent = useCallback(async (): Promise<void> => {
    if (
      !props.sessionId ||
      sending ||
      uploading ||
      draft ||
      uploads.length ||
      uploadAttempts.length
    )
      return;
    setSending(true);
    setArchiving(true);
    try {
      await chatClient.archiveSession(props.sessionId);
      await queryClient.invalidateQueries({
        queryKey: studioChatKeys.sessions,
      });
      if (mountedRef.current && currentDraftKey.current === draftKey)
        navigateToSession(undefined, true);
    } catch (cause) {
      if (mountedRef.current && currentDraftKey.current === draftKey)
        setError(errorMessage(cause, "Conversation could not be archived"));
    } finally {
      if (mountedRef.current && currentDraftKey.current === draftKey) {
        setSending(false);
        setArchiving(false);
      }
    }
  }, [
    chatClient,
    navigateToSession,
    props.sessionId,
    queryClient,
    sending,
    uploading,
    draft,
    uploads.length,
    uploadAttempts.length,
    draftKey,
  ]);

  const workspaceBadges = Object.fromEntries(
    props.workspaces.flatMap((workspace) =>
      workspace.badge === undefined ? [] : [[workspace.id, workspace.badge]],
    ),
  );

  return (
    <div
      className={chatClass("studio", library.frame, chatLayout.root)}
      data-view="chat"
      data-studio-shell=""
    >
      <StudioChrome
        contextLabel="Chat"
        navigation={{
          types: props.types,
          workspaces: props.workspaces,
          activeEntityType: null,
          activeWorkspaceId: STUDIO_CHAT_WORKSPACE_ID,
          workspaceBadges,
          selectEntityType: props.selectEntityType,
          selectWorkspace: props.selectWorkspace,
        }}
      />
      <div
        className={navClass(
          "studio-chat-shell",
          chatLayout.shell,
          nav.shell,
          navigationCollapsed && nav.shellCollapsed,
        )}
      >
        <aside className={navClass("rail studio-chat-studio-rail", nav.rail)}>
          <TypeSwitcher
            renderMode="desktop"
            types={props.types}
            active={null}
            onSelect={props.selectEntityType}
            workspaces={props.workspaces}
            activeWorkspace={STUDIO_CHAT_WORKSPACE_ID}
            workspaceBadges={workspaceBadges}
            onSelectWorkspace={props.selectWorkspace}
          />
        </aside>
        <main className={chatClass("studio-chat-workspace", chatLayout.frame)}>
          <div className={chatClass("studio-chat-room", chatLayout.room)}>
            <section
              className={chatClass("studio-chat-thread", chatLayout.thread)}
              aria-label="Conversation"
            >
              <header
                className={chatClass(
                  "studio-chat-thread-head",
                  chatLayout.threadHead,
                )}
              >
                <h1
                  className={chatClass(
                    "studio-chat-session-heading",
                    chatLayout.title,
                  )}
                  title={currentSession?.title}
                >
                  {currentSession?.title ??
                    (props.sessionId ? "Conversation" : "New conversation")}
                </h1>
                <div
                  className={chatClass(
                    "studio-chat-head-actions",
                    chatLayout.toolbar,
                  )}
                >
                  <span
                    ref={sessionPickerTrigger}
                    className="studio-chat-session-picker-trigger"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      xstyle={chatLayout.toolbarButton}
                      aria-haspopup="dialog"
                      aria-expanded={sessionPickerOpen}
                      onClick={() => setSessionPickerOpen(true)}
                    >
                      History
                    </Button>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    xstyle={chatLayout.toolbarButton}
                    aria-label="New conversation"
                    title="New conversation"
                    onClick={() => navigateToSession()}
                  >
                    +
                  </Button>
                  <span ref={detailsTrigger}>
                    <Button
                      type="button"
                      variant="ghost"
                      xstyle={chatLayout.toolbarButton}
                      aria-label="Conversation details and options"
                      aria-haspopup="dialog"
                      aria-expanded={detailsOpen}
                      onClick={() => setDetailsOpen(true)}
                    >
                      •••
                    </Button>
                  </span>
                </div>
              </header>
              <Dialog
                open={sessionPickerOpen}
                onOpenChange={setSessionPickerOpen}
              >
                <DialogContent
                  aria-describedby={undefined}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    sessionPickerTrigger.current
                      ?.querySelector("button")
                      ?.focus();
                  }}
                >
                  <DialogTitle>Conversations</DialogTitle>
                  <SessionRail
                    {...sessionControls}
                    activeSessionId={props.sessionId}
                    loading={sessionsLoading}
                    sessions={sessions}
                    onNew={() => navigateToSession()}
                    onSelect={navigateToSession}
                  />
                </DialogContent>
              </Dialog>
              <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent
                  aria-describedby={undefined}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    detailsTrigger.current?.querySelector("button")?.focus();
                  }}
                >
                  <DialogTitle>Conversation details</DialogTitle>
                  <div
                    className={chatClass(
                      "studio-chat-details",
                      chatLayout.details,
                    )}
                  >
                    <p>{currentSession?.title ?? "New conversation"}</p>
                    <div
                      className={chatClass(
                        "studio-chat-session-actions",
                        chatLayout.actions,
                      )}
                    >
                      {currentSession && (
                        <StudioChatSessionRename
                          key={currentSession.id}
                          title={currentSession.title}
                          onRename={async (title): Promise<void> => {
                            const result = await chatClient.renameSession(
                              currentSession.id,
                              title,
                            );
                            if (!result.renamed)
                              throw new Error(
                                "The conversation could not be renamed.",
                              );
                            queryClient.setQueriesData<ChatSession[]>(
                              { queryKey: studioChatKeys.sessions },
                              (items) =>
                                items?.map((session) =>
                                  session.id === currentSession.id
                                    ? { ...session, title: result.title }
                                    : session,
                                ),
                            );
                            void queryClient.invalidateQueries({
                              queryKey: studioChatKeys.sessions,
                            });
                          }}
                        />
                      )}
                      {archivedSession && (
                        <p role="status">
                          Archived conversation. New messages here remain
                          archived.
                        </p>
                      )}
                      {props.sessionId && !archivedSession ? (
                        <Button
                          className="studio-chat-header-action"
                          variant="ghost"
                          type="button"
                          onClick={() => void archiveCurrent()}
                          disabled={
                            sending ||
                            uploading ||
                            Boolean(draft) ||
                            uploads.length > 0 ||
                            uploadAttempts.length > 0
                          }
                          title={
                            draft || uploads.length || uploadAttempts.length
                              ? "Send or clear the draft before archiving"
                              : undefined
                          }
                        >
                          {archiving ? "Archiving…" : "Archive"}
                        </Button>
                      ) : null}
                    </div>
                    <details>
                      <summary>Sources and attachments</summary>
                      <ConversationContext
                        cards={contextCards}
                        progress={stream?.progress ?? []}
                        session={currentSession}
                      />
                    </details>
                    <details>
                      <summary>File types and limits</summary>
                      <p id="studio-chat-upload-guidance">
                        {CHAT_UPLOAD_GUIDANCE}
                      </p>
                    </details>
                  </div>
                </DialogContent>
              </Dialog>
              <div
                ref={threadScrollRef}
                tabIndex={0}
                role="region"
                aria-label="Conversation messages"
                onScroll={onThreadScroll}
                className={chatClass(
                  "studio-chat-thread-scroll",
                  chatLayout.threadScroll,
                )}
              >
                <div
                  className={chatClass(
                    "studio-chat-manuscript",
                    chatLayout.manuscript,
                  )}
                >
                  {messagesQuery.error && (
                    <section role="alert">
                      <p>
                        {storedMessages.length > 0
                          ? "Showing previously loaded messages. "
                          : ""}
                        Conversation could not be loaded.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={messagesQuery.isFetching}
                        onClick={() => void messagesQuery.refetch()}
                      >
                        Retry conversation
                      </Button>
                    </section>
                  )}
                  {messagesQuery.isPending &&
                  props.sessionId &&
                  visibleMessages.length === 0 ? (
                    <p
                      className={chatClass(
                        "studio-chat-empty",
                        chatLayout.empty,
                      )}
                    >
                      Opening conversation…
                    </p>
                  ) : null}
                  {!messagesQuery.error &&
                  (!props.sessionId || !messagesQuery.isPending) &&
                  visibleMessages.length === 0 ? (
                    <ChatEmptyState />
                  ) : null}
                  {visibleMessages.map((message) => (
                    <ChatTurn
                      key={message.id}
                      message={message}
                      client={chatClient}
                      disabled={sending}
                      onAction={runSuggestedAction}
                      onApproval={respondToApproval}
                    />
                  ))}
                  {stream?.approvals.map((approval) => (
                    <ApprovalCard
                      key={approval.approvalId}
                      approval={approval}
                      disabled={sending}
                      onDecision={respondToApproval}
                    />
                  ))}
                  {stream && stream.progress.length > 0 && (
                    <details
                      className={chatClass(
                        "studio-chat-progress",
                        chatLayout.card,
                      )}
                    >
                      <summary>
                        Activity · {stream.progress.length} updates
                      </summary>
                      <pre className={chatClass("", chatLayout.source)}>
                        {JSON.stringify(stream.progress, null, 2)}
                      </pre>
                    </details>
                  )}
                  {sending ? (
                    <p
                      className={chatClass(
                        "studio-chat-stream-status",
                        chatLayout.empty,
                      )}
                      role="status"
                    >
                      Responding…
                    </p>
                  ) : null}
                  {interrupted && (
                    <section
                      className={chatClass(
                        "studio-chat-interruption",
                        chatLayout.empty,
                      )}
                      role={interrupted.kind === "stopped" ? "status" : "alert"}
                      aria-atomic="true"
                    >
                      <strong>
                        {interrupted.kind === "stopped"
                          ? "Stopped"
                          : interrupted.kind === "disconnected"
                            ? "Connection lost"
                            : "Response failed"}
                      </strong>
                      <p>
                        Any received text is kept here. Stopping the response
                        does not undo completed actions; the server may still be
                        working.
                      </p>
                      {interrupted.detail && <p>{interrupted.detail}</p>}
                      {interrupted.retry && (
                        <>
                          <p>
                            Sending again may repeat completed actions. Review
                            the request before sending.
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={
                              sending ||
                              uploading ||
                              Boolean(draft) ||
                              uploads.length > 0
                            }
                            onClick={() => {
                              if (
                                !interrupted.retry ||
                                draft ||
                                uploads.length > 0
                              )
                                return;
                              setDraft(interrupted.retry.text);
                              setUploads([...interrupted.retry.uploads]);
                              threadScrollRef.current
                                ?.closest(".studio-chat-thread")
                                ?.querySelector<HTMLTextAreaElement>("textarea")
                                ?.focus();
                            }}
                          >
                            Review retry in composer
                          </Button>
                          {(draft || uploads.length > 0) && (
                            <p>
                              Your composer draft is unchanged. Send or clear it
                              before restoring this request.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  )}
                  {error ? (
                    <p
                      className={chatClass(
                        "studio-chat-error",
                        chatLayout.empty,
                        chatLayout.error,
                      )}
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}
                  {/* Trailing anchor; the thread scrolls to its own end. */}
                  <div />
                </div>
              </div>
              <Composer
                onJumpToLatest={showJumpToLatest ? jumpToLatest : undefined}
                draft={draft}
                sending={sending}
                uploading={uploading}
                uploads={uploads}
                uploadAttempts={uploadAttempts}
                onRetryUpload={(attempt) => void runUploads([attempt])}
                onDismissUpload={dismissAttempt}
                onDraft={setDraft}
                locked={archiving}
                onRemoveUpload={(id) =>
                  setUploads((current) =>
                    current.filter((upload) => upload.id !== id),
                  )
                }
                onFiles={uploadFiles}
                onSubmit={submit}
                onStop={hasActiveStream() ? stopActiveStream : undefined}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
