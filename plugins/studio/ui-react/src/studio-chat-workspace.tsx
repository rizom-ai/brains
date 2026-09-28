/** @jsxImportSource react */
import { libraryStyles as library } from "./studio-library.styles";
import { Button, useAppFetch, useFollowTail } from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import type {
  StudioChatDraftStore,
  StudioChatNavigationState,
} from "./studio-chat-drafts";
import { createChatClient } from "@brains/contracts/chat";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
  type ReactElement,
} from "react";
import { STUDIO_CHAT_WORKSPACE_ID } from "../../src/chat-workspace";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { StudioChatHandoff } from "./operator-launch";
import { TypeSwitcher } from "./entity-fields";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { workspaceRailBadges } from "./studio-app-model";
import { ChatEmptyState, ChatTurn, ApprovalCard } from "./studio-chat-thread";
import { Composer } from "./studio-chat-composer";
import { StudioChatInterruption } from "./studio-chat-interruption";
import { StudioChatThreadHead } from "./studio-chat-thread-head";
import { useChatDraft } from "./use-chat-draft";
import { useChatSessions } from "./use-chat-sessions";
import { useChatStream } from "./use-chat-stream";
import { useChatUploads } from "./use-chat-uploads";
import { useChatArchive } from "./use-chat-archive";
import { useChatHandoff } from "./use-chat-handoff";
import { useChatThread } from "./use-chat-thread";
import { useChatNavigationState } from "./use-chat-navigation-state";

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
  const {
    draftStore,
    draftKey,
    currentDraftKey,
    draft,
    uploads,
    setDraft,
    setUploads,
  } = useChatDraft({
    draftStore: props.draftStore,
    apiPath: props.apiPath,
    sessionId: props.sessionId,
  });
  const {
    uploading,
    uploadAttempts,
    runUploads,
    uploadFiles,
    dismissAttempt,
    reset: resetUploads,
  } = useChatUploads({ chatClient, draftKey, currentDraftKey, setUploads });
  const navigationCollapsed = useStudioNavigationCollapsed();
  const chatSessions = useChatSessions({
    chatClient,
    queryClient,
    sessionId: props.sessionId,
    studioBasePath: props.studioBasePath,
    navigate: props.navigate,
  });
  const { navigateToSession, closeDisclosures } = chatSessions;
  const mountedRef = useRef(false);
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

  useChatHandoff({
    chatClient,
    handoff: props.handoff,
    sessionId: props.sessionId,
    apiPath: props.apiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    setDraft,
    setError,
    navigateToSession,
  });
  // Text or uploads in the composer, which restoring a failed request would replace.
  const composerHasContent = Boolean(draft) || uploads.length > 0;
  // Anything the composer holds, including uploads still being retried.
  const draftPending = composerHasContent || uploadAttempts.length > 0;
  const archiveBlocked = sending || uploading || draftPending;
  const {
    archiving,
    archiveCurrent,
    reset: resetArchive,
  } = useChatArchive({
    chatClient,
    queryClient,
    sessionId: props.sessionId,
    draftKey,
    currentDraftKey,
    mountedRef,
    blocked: archiveBlocked,
    setSending,
    setError,
    navigateToSession,
  });
  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      abortActiveStream();
    };
  }, [abortActiveStream]);
  useChatNavigationState({
    onChange: props.onNavigationStateChange,
    draft,
    uploadCount: uploads.length,
    uploadAttemptCount: uploadAttempts.length,
    sending,
    uploading,
  });

  const {
    visibleMessages,
    contextCards,
    historyFailed,
    historyOpening,
    historyReading,
    hasStoredHistory,
    retryHistory,
  } = useChatThread({
    chatClient,
    sessionId: props.sessionId,
    sending,
    pendingMessages,
    stream,
  });
  const {
    ref: threadScrollRef,
    onScroll: onThreadScroll,
    awayFromLatest: showJumpToLatest,
    jumpToLatest,
  } = useFollowTail({
    resetKey: props.sessionId,
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
    resetArchive();
  }, [props.sessionId]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submitPrompt(draft);
  };

  const workspaceBadges = workspaceRailBadges(props.workspaces);

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
              <StudioChatThreadHead
                sessionId={props.sessionId}
                sessions={chatSessions}
                archiving={archiving}
                archiveBlocked={archiveBlocked}
                draftPending={draftPending}
                onArchive={() => void archiveCurrent()}
                contextCards={contextCards}
                progress={stream?.progress ?? []}
              />
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
                  {historyFailed && (
                    <section role="alert">
                      <p>
                        {hasStoredHistory
                          ? "Showing previously loaded messages. "
                          : ""}
                        Conversation could not be loaded.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={historyReading}
                        onClick={retryHistory}
                      >
                        Retry conversation
                      </Button>
                    </section>
                  )}
                  {historyOpening &&
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
                  {!historyFailed &&
                  (!props.sessionId || !historyOpening) &&
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
                    <StudioChatInterruption
                      interrupted={interrupted}
                      draftPending={composerHasContent}
                      restoreBlocked={sending || uploading}
                      onRestore={(retry) => {
                        setDraft(retry.text);
                        setUploads([...retry.uploads]);
                        threadScrollRef.current
                          ?.closest(".studio-chat-thread")
                          ?.querySelector<HTMLTextAreaElement>("textarea")
                          ?.focus();
                      }}
                    />
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
