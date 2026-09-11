/** @jsxImportSource react */
import { libraryStyles as library } from "./studio-library.styles";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import {
  StudioChatDraftStore,
  studioChatDraftKey,
  type StudioChatNavigationState,
} from "./studio-chat-drafts";
import { StudioPageHead, studioAccessRequirement } from "./studio-page-head";
import {
  createChatClient,
  readChatProtocolEvents,
  type ChatCard,
  type ChatHistoryMessage,
  type ChatMessage,
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
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { Streamdown } from "streamdown";
import {
  STUDIO_CHAT_WORKSPACE_ID,
  studioChatWorkspacePath,
} from "../../src/chat-workspace";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { StudioChatHandoff } from "./operator-launch";
import {
  approvalResponseMessage,
  createStudioChatStreamState,
  reduceStudioChatStream,
  streamAssistantMessage,
  type StudioChatApproval,
  type StudioChatStreamState,
} from "./chat-workspace-model";
import { TypeSwitcher } from "./entity-fields";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";

const studioChatKeys = {
  sessions: ["studio", "chat", "sessions"] as const,
  messages: (conversationId: string) =>
    ["studio", "chat", "messages", conversationId] as const,
};

type ChatActionCard = Extract<ChatCard, { kind: "actions" }>;
type ChatSuggestedAction = ChatActionCard["actions"][number];

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
  const chatClient = useMemo(
    () =>
      createChatClient({
        apiPath: props.apiPath,
        fetch: (input, init) => globalThis.fetch(input, init),
      }),
    [props.apiPath],
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
  const [pendingMessages, setPendingMessages] = useState<ChatHistoryMessage[]>(
    [],
  );
  const [stream, setStream] = useState<StudioChatStreamState | null>(null);
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    props.onNavigationStateChange?.({
      hasDraft: Boolean(draft || uploads.length),
      busy: sending || uploading,
    });
  }, [draft, uploads, sending, uploading, props.onNavigationStateChange]);
  useEffect(
    () => (): void =>
      props.onNavigationStateChange?.({ hasDraft: false, busy: false }),
    [props.onNavigationStateChange],
  );
  const navigationCollapsed = useStudioNavigationCollapsed();
  const [contextOpen, setContextOpen] = useState(false);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const sessionPickerTrigger = useRef<HTMLSpanElement>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const activeStreamRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      const active = activeStreamRef.current;
      activeStreamRef.current = null;
      active?.abort();
    };
  }, []);
  const handledHandoffRef = useRef<string | null>(null);
  const adoptedSessionRef = useRef<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: studioChatKeys.sessions,
    queryFn: () => chatClient.listSessions(),
  });
  const messagesQuery = useQuery({
    queryKey: studioChatKeys.messages(props.sessionId ?? ""),
    queryFn: () => chatClient.getMessages(props.sessionId ?? ""),
    enabled: props.sessionId !== null,
  });
  const sessions = sessionsQuery.data ?? [];
  const showSessionRail = sessionsQuery.isPending || sessions.length > 0;
  const storedMessages = messagesQuery.data ?? [];
  const currentSession = sessions.find(
    (session) => session.id === props.sessionId,
  );
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

  useEffect(() => {
    if (props.sessionId && adoptedSessionRef.current === props.sessionId) {
      adoptedSessionRef.current = null;
      return;
    }
    const active = activeStreamRef.current;
    activeStreamRef.current = null;
    active?.abort();
    setSending(false);
    setPendingMessages([]);
    setStream(null);
    setUploading(false);
    setArchiving(false);
    setError(null);
  }, [props.sessionId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [stream?.text, visibleMessages.length]);

  const navigateToSession = useCallback(
    (conversationId?: string, preserveWork = false): void => {
      props.navigate(
        studioChatWorkspacePath(props.studioBasePath, conversationId),
        { preserveWork },
      );
      setSessionPickerOpen(false);
    },
    [props.navigate, props.studioBasePath],
  );

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

  const runStream = useCallback(
    async (
      conversationId: string,
      messages: ChatMessage[],
      onAccepted?: () => void,
    ): Promise<boolean> => {
      activeStreamRef.current?.abort();
      const controller = new AbortController();
      activeStreamRef.current = controller;
      setSending(true);
      setError(null);
      let next = createStudioChatStreamState();
      setStream(next);
      let accepted = false;
      let retained = false;
      const retainResponse = (): void => {
        if (retained || (!next.text && next.cards.length === 0)) return;
        retained = true;
        const message = streamAssistantMessage(next);
        setPendingMessages((current) => [...current, message]);
        setStream({ ...next, text: "", cards: [] });
      };
      try {
        const response = await chatClient.streamMessages(
          {
            id: conversationId,
            messages,
            trigger: "submit-message",
          },
          { signal: controller.signal },
        );
        accepted = true;
        onAccepted?.();
        for await (const event of readChatProtocolEvents(response)) {
          if (activeStreamRef.current !== controller) return accepted;
          next = reduceStudioChatStream(next, event);
          setStream(next);
        }
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        await queryClient.invalidateQueries({
          queryKey: studioChatKeys.sessions,
        });
      } catch (cause) {
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "Chat could not complete the response"));
      } finally {
        if (activeStreamRef.current === controller) {
          activeStreamRef.current = null;
          setSending(false);
        }
      }
      return accepted;
    },
    [chatClient, queryClient],
  );

  const submitPrompt = useCallback(
    async (prompt: string): Promise<void> => {
      const text = prompt.trim();
      if ((!text && uploads.length === 0) || sending || uploading) return;
      const conversationId = props.sessionId ?? `web-${crypto.randomUUID()}`;
      const sentKey = studioChatDraftKey(props.apiPath, conversationId);
      const messageId = crypto.randomUUID();
      const uploadParts = uploads.map((upload) => ({
        type: "data-upload" as const,
        data: { ref: upload.ref },
      }));
      const parts = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...uploadParts,
      ];
      setPendingMessages((current) => [
        ...current,
        {
          id: messageId,
          role: "user",
          content: text || uploads.map((upload) => upload.filename).join(", "),
        },
      ]);
      const accepted = await runStream(
        conversationId,
        [{ id: messageId, role: "user", parts }],
        () => {
          if (
            !props.sessionId &&
            mountedRef.current &&
            currentDraftKey.current === draftKey
          ) {
            draftStore.adopt(draftKey, sentKey);
            adoptedSessionRef.current = conversationId;
            navigateToSession(conversationId, true);
          }
          const current = draftStore.read(sentKey);
          draftStore.update(sentKey, {
            text: current.text === prompt ? "" : current.text,
            uploads: current.uploads.filter(
              (upload) => !uploads.some((sent) => sent.id === upload.id),
            ),
          });
        },
      );
      if (
        !accepted &&
        (currentDraftKey.current === sentKey ||
          (!props.sessionId && currentDraftKey.current === draftKey))
      )
        setPendingMessages((current) =>
          current.filter((message) => message.id !== messageId),
        );
    },
    [
      navigateToSession,
      props.sessionId,
      props.apiPath,
      draftStore,
      draftKey,
      runStream,
      sending,
      uploading,
      uploads,
    ],
  );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submitPrompt(draft);
  };

  const respondToApproval = useCallback(
    async (approval: StudioChatApproval, approved: boolean): Promise<void> => {
      if (!props.sessionId || sending) return;
      await runStream(props.sessionId, [
        approvalResponseMessage(approval, approved),
      ]);
    },
    [props.sessionId, runStream, sending],
  );

  const runSuggestedAction = useCallback(
    async (action: ChatSuggestedAction): Promise<void> => {
      if (action.type === "prompt") {
        await submitPrompt(action.prompt);
        return;
      }
      if (!props.sessionId || sending) return;
      setSending(true);
      setError(null);
      try {
        const result = await chatClient.runAction({
          conversationId: props.sessionId,
          action: {
            type: "event",
            event: action.event,
            ...(action.fromState ? { fromState: action.fromState } : {}),
          },
        });
        if (!mountedRef.current || currentDraftKey.current !== draftKey) return;
        setPendingMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.text,
            ...(result.cards ? { cards: result.cards } : {}),
          },
        ]);
      } catch (cause) {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setError(errorMessage(cause, "Chat action failed"));
      } finally {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setSending(false);
      }
    },
    [chatClient, props.sessionId, sending, submitPrompt, draftKey],
  );

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const uploaded = await Promise.all(
          files.map((file) => chatClient.upload(file, file.name)),
        );
        setUploads((current) => [...current, ...uploaded]);
      } catch (cause) {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setError(errorMessage(cause, "Upload failed"));
      } finally {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setUploading(false);
      }
    },
    [chatClient, setUploads, draftKey],
  );

  const archiveCurrent = useCallback(async (): Promise<void> => {
    if (!props.sessionId || sending || uploading || draft || uploads.length)
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
          <StudioPageHead
            model={{
              title: "Chat",
              totals: [],
              access: studioAccessRequirement("trusted"),
            }}
            action={
              <div
                className={chatClass(
                  "studio-chat-head-actions",
                  chatLayout.actions,
                )}
              >
                <span
                  ref={sessionPickerTrigger}
                  className="studio-chat-mobile-sessions"
                >
                  <Button
                    aria-expanded={sessionPickerOpen}
                    aria-haspopup="dialog"
                    variant="outline"
                    type="button"
                    onClick={() => setSessionPickerOpen(true)}
                  >
                    Sessions
                  </Button>
                </span>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => navigateToSession()}
                >
                  New conversation
                </Button>
              </div>
            }
          />
          <Dialog
            open={sessionPickerOpen}
            onOpenChange={(open) => {
              setSessionPickerOpen(open);
            }}
          >
            <DialogContent
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                sessionPickerTrigger.current?.querySelector("button")?.focus();
              }}
            >
              <DialogTitle>Conversations</DialogTitle>
              <SessionRail
                popup
                activeSessionId={props.sessionId}
                loading={sessionsQuery.isPending}
                sessions={sessions}
                onNew={() => navigateToSession()}
                onSelect={navigateToSession}
              />
            </DialogContent>
          </Dialog>
          <div
            className={chatClass(
              "studio-chat-room",
              chatLayout.room,
              !showSessionRail && chatLayout.roomWithoutSessions,
            )}
          >
            {showSessionRail && (
              <SessionRail
                activeSessionId={props.sessionId}
                loading={sessionsQuery.isPending}
                sessions={sessions}
                onNew={() => navigateToSession()}
                onSelect={navigateToSession}
              />
            )}
            <section
              className={chatClass("studio-chat-thread", chatLayout.thread)}
              aria-label="Conversation"
            >
              <header
                className={chatClass(
                  "studio-chat-thread-head",
                  chatLayout.threadHead,
                  !props.sessionId &&
                    visibleMessages.length === 0 &&
                    chatLayout.emptyThreadHead,
                )}
              >
                <div
                  className={chatClass(
                    "studio-chat-head-copy",
                    chatLayout.headCopy,
                  )}
                >
                  <h2
                    className={chatClass(
                      "studio-chat-session-heading",
                      chatLayout.title,
                    )}
                  >
                    {currentSession?.title ?? "New conversation"}
                  </h2>
                </div>
                {props.sessionId ? (
                  <Button
                    className="studio-chat-header-action"
                    variant="ghost"
                    type="button"
                    onClick={() => void archiveCurrent()}
                    disabled={
                      sending ||
                      uploading ||
                      Boolean(draft) ||
                      uploads.length > 0
                    }
                    title={
                      draft || uploads.length
                        ? "Send or clear the draft before archiving"
                        : undefined
                    }
                  >
                    {archiving ? "Archiving…" : "Archive"}
                  </Button>
                ) : null}
              </header>
              {(props.sessionId !== null || visibleMessages.length > 0) && (
                <details
                  className={chatClass(
                    "studio-chat-working-set",
                    chatLayout.context,
                  )}
                  open={contextOpen}
                  onToggle={(event) => setContextOpen(event.currentTarget.open)}
                >
                  <summary
                    className={chatClass(
                      "studio-chat-working-set-summary",
                      chatLayout.summary,
                    )}
                  >
                    Working set
                  </summary>
                  <WorkingSet
                    cards={contextCards}
                    messages={visibleMessages}
                    progress={stream?.progress ?? []}
                    session={currentSession}
                  />
                </details>
              )}
              <div
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
                  {messagesQuery.isPending && props.sessionId ? (
                    <p
                      className={chatClass(
                        "studio-chat-empty",
                        chatLayout.empty,
                      )}
                    >
                      Opening conversation…
                    </p>
                  ) : null}
                  {(!props.sessionId || !messagesQuery.isPending) &&
                  visibleMessages.length === 0 ? (
                    <ChatEmptyState />
                  ) : null}
                  {visibleMessages.map((message) => (
                    <ChatTurn
                      key={message.id}
                      message={message}
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
                  {sending ? (
                    <p
                      className={chatClass(
                        "studio-chat-stream-status",
                        chatLayout.empty,
                      )}
                      role="status"
                    >
                      Working…
                    </p>
                  ) : null}
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
                  <div ref={threadEndRef} />
                </div>
              </div>
              <Composer
                draft={draft}
                sending={sending}
                uploading={uploading}
                uploads={uploads}
                onDraft={setDraft}
                locked={archiving}
                onRemoveUpload={(id) =>
                  setUploads((current) =>
                    current.filter((upload) => upload.id !== id),
                  )
                }
                onFiles={uploadFiles}
                onSubmit={submit}
                onStop={
                  activeStreamRef.current
                    ? (): void => activeStreamRef.current?.abort()
                    : undefined
                }
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function SessionRail(props: {
  popup?: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <aside
      className={
        props.popup
          ? chatClass("studio-chat-session-picker", chatLayout.picker)
          : chatClass("studio-chat-sessions", chatLayout.sessions)
      }
      aria-label="Chat sessions"
    >
      {props.popup && (
        <header
          className={chatClass(
            "studio-chat-sessions-head",
            chatLayout.threadHead,
          )}
        >
          <div
            className={chatClass("studio-chat-head-copy", chatLayout.headCopy)}
          >
            <h2
              className={chatClass(
                "studio-chat-sessions-title",
                chatLayout.subheading,
              )}
            >
              Sessions
            </h2>
          </div>
          <button
            className={chatClass("studio-chat-new", chatLayout.button)}
            type="button"
            aria-label="New conversation"
            onClick={props.onNew}
          >
            +
          </button>
        </header>
      )}
      <div
        className={chatClass(
          "studio-chat-session-list",
          chatLayout.sessionList,
        )}
      >
        {props.loading ? (
          <p className={chatClass("studio-chat-empty", chatLayout.empty)}>
            Loading sessions…
          </p>
        ) : null}
        {!props.loading && props.sessions.length === 0 ? (
          <p className={chatClass("studio-chat-empty", chatLayout.empty)}>
            No conversations yet.
          </p>
        ) : null}
        {props.sessions.map((session) => (
          <button
            className={chatClass(
              "studio-chat-session",
              chatLayout.session,
              session.id === props.activeSessionId && chatLayout.activeSession,
            )}
            data-active={
              session.id === props.activeSessionId ? "true" : "false"
            }
            type="button"
            key={session.id}
            onClick={() => props.onSelect(session.id)}
          >
            <strong
              className={chatClass(
                "studio-chat-session-title",
                chatLayout.sessionTitle,
              )}
            >
              {session.title}
            </strong>
            <time
              className={chatClass(
                "studio-chat-session-time",
                chatLayout.timestamp,
              )}
              dateTime={session.lastActiveAt}
              title={session.lastActiveAt}
            >
              {formatSessionTime(session.lastActiveAt)}
            </time>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ChatEmptyState(): ReactElement {
  return (
    <section
      className={chatClass(
        "studio-chat-empty",
        chatLayout.empty,
        chatLayout.emptyConversation,
      )}
      aria-label="New conversation"
    >
      <p className={chatClass("", chatLayout.cardText)}>
        No messages yet. Your draft stays in the composer until you send it.
      </p>
    </section>
  );
}

function ChatTurn(props: {
  message: ChatHistoryMessage;
  onAction: (action: ChatSuggestedAction) => Promise<void>;
  onApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  return (
    <article
      className={chatClass("studio-chat-turn", chatLayout.turn)}
      data-role={props.message.role}
    >
      <span className={chatClass("studio-chat-turn-label", chatLayout.speaker)}>
        {props.message.role === "user" ? "You" : "Brain"}
      </span>
      <div
        className={chatClass(
          "studio-chat-turn-body",
          chatLayout.turnBody,
          props.message.role === "user" && chatLayout.userBody,
        )}
      >
        {props.message.content ? (
          props.message.role === "assistant" ? (
            <Streamdown
              className={chatClass("studio-chat-prose", chatLayout.cards)}
            >
              {props.message.content}
            </Streamdown>
          ) : (
            <p className={chatClass("studio-chat-text", chatLayout.paragraph)}>
              {props.message.content}
            </p>
          )
        ) : null}
        {props.message.attachments?.map((attachment) => (
          <p
            className={chatClass("studio-chat-upload", chatLayout.upload)}
            key={`${attachment.filename}-${attachment.createdAt}`}
          >
            {attachment.filename}
          </p>
        ))}
        {props.message.cards?.length ? (
          <div className={chatClass("studio-chat-cards", chatLayout.cards)}>
            {props.message.cards.map((card) => (
              <MessageCard
                card={card}
                key={`${card.kind}-${card.id}`}
                onAction={props.onAction}
                onApproval={props.onApproval}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MessageCard(props: {
  card: ChatCard;
  onAction: (action: ChatSuggestedAction) => Promise<void>;
  onApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  const { card } = props;
  if (card.kind === "actions") {
    return (
      <section className={chatClass("studio-chat-card", chatLayout.card)}>
        <span
          className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}
        >
          Actions
        </span>
        {card.title ? <strong>{card.title}</strong> : null}
        <div
          className={chatClass("studio-chat-card-actions", chatLayout.actions)}
        >
          {card.actions.map((action) => (
            <button
              className={chatClass(
                "studio-chat-card-action",
                chatLayout.button,
              )}
              type="button"
              key={action.id}
              onClick={() => void props.onAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    );
  }
  if (card.kind === "sources") {
    return (
      <section className={chatClass("studio-chat-card", chatLayout.card)}>
        <span
          className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}
        >
          Sources
        </span>
        <ul>
          {card.sources.map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a href={source.url}>{source.title ?? source.source}</a>
              ) : (
                (source.title ?? source.source)
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (card.kind === "attachment") {
    return (
      <section className={chatClass("studio-chat-card", chatLayout.card)}>
        <span
          className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}
        >
          Artifact
        </span>
        <strong>{card.title}</strong>
        {card.description ? (
          <p
            className={chatClass(
              "studio-chat-card-description",
              chatLayout.cardText,
            )}
          >
            {card.description}
          </p>
        ) : null}
        {card.attachment.previewUrl || card.attachment.downloadUrl ? (
          <div
            className={chatClass(
              "studio-chat-card-actions",
              chatLayout.actions,
            )}
          >
            <a
              className={chatClass(
                "studio-chat-card-action",
                chatLayout.button,
              )}
              href={card.attachment.previewUrl ?? card.attachment.downloadUrl}
            >
              Open
            </a>
          </div>
        ) : null}
      </section>
    );
  }
  const pending = card.state === "approval-requested";
  const approval: StudioChatApproval = {
    approvalId: card.id,
    toolCallId: card.toolCallId ?? card.id,
    toolName: card.toolName,
    ...(card.input ? { input: card.input } : {}),
    ...(card.summary ? { title: card.summary } : {}),
  };
  return (
    <section className={chatClass("studio-chat-card", chatLayout.card)}>
      <span className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}>
        {pending ? "Approval required" : "Approval record"}
      </span>
      <strong>{card.summary}</strong>
      {card.preview ? (
        <p
          className={chatClass(
            "studio-chat-card-preview",
            chatLayout.paragraph,
          )}
        >
          {card.preview}
        </p>
      ) : null}
      {pending ? (
        <div
          className={chatClass(
            "studio-chat-approval-actions",
            chatLayout.actions,
          )}
        >
          <button
            className={chatClass(
              "studio-chat-approval-action",
              chatLayout.button,
            )}
            type="button"
            onClick={() => void props.onApproval(approval, false)}
          >
            Decline
          </button>
          <button
            className={chatClass(
              "studio-chat-approval-action",
              chatLayout.button,
              chatLayout.primaryButton,
            )}
            data-primary="true"
            type="button"
            onClick={() => void props.onApproval(approval, true)}
          >
            Approve
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ApprovalCard(props: {
  approval: StudioChatApproval;
  disabled: boolean;
  onDecision: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  return (
    <section className={chatClass("studio-chat-approval", chatLayout.card)}>
      <span className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}>
        Approval required
      </span>
      <strong>{props.approval.title ?? props.approval.toolName}</strong>
      <div
        className={chatClass(
          "studio-chat-approval-actions",
          chatLayout.actions,
        )}
      >
        <button
          className={chatClass(
            "studio-chat-approval-action",
            chatLayout.button,
          )}
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onDecision(props.approval, false)}
        >
          Decline
        </button>
        <button
          className={chatClass(
            "studio-chat-approval-action",
            chatLayout.button,
            chatLayout.primaryButton,
          )}
          data-primary="true"
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onDecision(props.approval, true)}
        >
          Approve
        </button>
      </div>
    </section>
  );
}

function Composer(props: {
  locked: boolean;
  onRemoveUpload: (id: string) => void;
  draft: string;
  uploads: ChatUploadResponse[];
  sending: boolean;
  uploading: boolean;
  onDraft: (value: string) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop?: (() => void) | undefined;
}): ReactElement {
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  return (
    <footer className={chatClass("studio-chat-composer", chatLayout.composer)}>
      {props.uploads.length > 0 ? (
        <div
          className={chatClass(
            "studio-chat-upload-list",
            chatLayout.uploadList,
          )}
        >
          {props.uploads.map((upload) => (
            <span
              className={chatClass("studio-chat-upload", chatLayout.upload)}
              key={upload.id}
            >
              {upload.filename}{" "}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${upload.filename} from message`}
                disabled={props.locked}
                onClick={() => props.onRemoveUpload(upload.id)}
              >
                ×
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className={chatClass("studio-chat-composer-form", chatLayout.form)}
        onSubmit={props.onSubmit}
      >
        <label
          className={chatClass(
            "studio-chat-message-label",
            chatLayout.fieldLabel,
          )}
        >
          Message
          <textarea
            className={chatClass("studio-chat-message", chatLayout.input)}
            aria-label="Message"
            placeholder="Write to your brain…"
            value={props.draft}
            disabled={props.locked}
            onChange={(event) => props.onDraft(event.target.value)}
            onKeyDown={keyDown}
          />
        </label>
        <div
          className={chatClass(
            "studio-chat-composer-actions",
            chatLayout.actions,
          )}
        >
          <label
            className={chatClass(
              "studio-chat-composer-action",
              chatLayout.attachButton,
            )}
            aria-label="Attach files"
          >
            {props.uploading ? "Attaching…" : "Attach files"}
            <input
              className={chatClass(
                "studio-chat-upload-input",
                chatLayout.uploadInput,
              )}
              type="file"
              multiple
              disabled={props.locked || props.sending || props.uploading}
              onChange={(event) => void props.onFiles(event)}
            />
          </label>
          {props.locked ? (
            <Button type="button" disabled>
              Archiving…
            </Button>
          ) : props.sending ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onStop}
              disabled={!props.onStop}
              title="Stop receiving the response. Completed actions are not undone."
            >
              Stop
            </Button>
          ) : (
            <Button
              className="studio-chat-composer-action"
              type="submit"
              aria-label="Send message"
              disabled={
                props.uploading ||
                (!props.draft.trim() && props.uploads.length === 0)
              }
            >
              Send
            </Button>
          )}
        </div>
      </form>
    </footer>
  );
}

function WorkingSet(props: {
  cards: ChatCard[];
  messages: ChatHistoryMessage[];
  progress: StudioChatStreamState["progress"];
  session: ChatSession | undefined;
}): ReactElement {
  return (
    <aside
      className={chatClass("studio-chat-context", chatLayout.contextBody)}
      aria-label="Working set"
    >
      <div className={chatClass("studio-chat-context-list", chatLayout.cards)}>
        {props.session?.contextHandoff ? (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              Linked context
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
              )}
            >
              {props.session.contextHandoff.titleSeed}
            </h3>
            <p
              className={chatClass(
                "studio-chat-context-card-text",
                chatLayout.cardText,
              )}
            >
              {props.session.contextHandoff.sourceId} ·{" "}
              {props.session.contextHandoff.itemId}
            </p>
          </section>
        ) : null}
        {props.cards.length === 0 && props.progress.length === 0 ? (
          <p className={chatClass("studio-chat-empty", chatLayout.empty)}>
            Sources, artifacts, and durable jobs appear here as the conversation
            develops.
          </p>
        ) : null}
        {props.cards.map((card, index) => (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
            key={`${card.kind}-${card.id}-${index}`}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              {card.kind === "sources" ? "Sources" : "Artifact"}
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
              )}
            >
              {card.kind === "sources"
                ? (card.title ?? `${card.sources.length} consulted`)
                : card.kind === "attachment"
                  ? card.title
                  : "Conversation context"}
            </h3>
            {card.kind === "sources" ? (
              <>
                <ul>
                  {card.sources.slice(0, 5).map((source) => (
                    <li key={source.id}>{source.title ?? source.source}</li>
                  ))}
                </ul>
                {card.sources.length > 5 ? (
                  <p
                    className={chatClass(
                      "studio-chat-context-card-text",
                      chatLayout.cardText,
                    )}
                  >
                    {card.sources.length - 5} more sources in the conversation.
                  </p>
                ) : null}
              </>
            ) : card.kind === "attachment" && card.description ? (
              <p
                className={chatClass(
                  "studio-chat-context-card-text",
                  chatLayout.cardText,
                )}
              >
                {card.description}
              </p>
            ) : null}
          </section>
        ))}
        {props.progress.map((item, index) => (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
            key={`${item.type}-${index}`}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              Durable job
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
              )}
            >
              {item.operationTarget ?? item.operationType}
            </h3>
            <p
              className={chatClass(
                "studio-chat-context-card-text",
                chatLayout.cardText,
              )}
            >
              {item.message ?? item.status}
            </p>
          </section>
        ))}
        {props.messages.length > 0 ? (
          <section
            className={chatClass(
              "studio-chat-context-card",
              chatLayout.contextItem,
            )}
          >
            <span
              className={chatClass(
                "studio-chat-context-kicker",
                chatLayout.kicker,
              )}
            >
              Activity
            </span>
            <h3
              className={chatClass(
                "studio-chat-context-card-title",
                chatLayout.cardHeading,
              )}
            >
              Visible conversation
            </h3>
            <p
              className={chatClass(
                "studio-chat-context-card-text",
                chatLayout.cardText,
              )}
            >
              {props.messages.length} visible messages.
            </p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "short",
    timeZoneName: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
