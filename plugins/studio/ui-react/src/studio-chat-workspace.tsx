/** @jsxImportSource react */
import { libraryStyles as library } from "./studio-library.styles";
import { StudioChatAttachment } from "./studio-chat-attachment";
import { StudioChatSessionRename } from "./studio-chat-session-rename";
import {
  messageUploadAccept,
  messageTextUploadMaxBytes,
  messageUploadMaxBytes,
} from "@brains/contracts/upload-policy";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  NativeSelect,
} from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import {
  StudioChatDraftStore,
  studioChatDraftKey,
  type StudioChatNavigationState,
} from "./studio-chat-drafts";
import { typographyStyles } from "./studio-typography.styles";
import {
  createChatClient,
  readChatProtocolEvents,
  type ChatCard,
  type ChatClient,
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
  StudioCollectionBar,
  StudioCollectionPager,
} from "./studio-collection-controls";
import { StudioMarkdown } from "./studio-markdown";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";

const CHAT_UPLOAD_GUIDANCE = `Text/Markdown up to ${messageTextUploadMaxBytes / 1000} KB; PNG, JPEG, WebP, GIF or PDF up to ${messageUploadMaxBytes / 1000000} MB.`;

const studioChatKeys = {
  sessions: ["studio", "chat", "sessions"] as const,
  messages: (conversationId: string) =>
    ["studio", "chat", "messages", conversationId] as const,
};

type ChatActionCard = Extract<ChatCard, { kind: "actions" }>;
type ChatSuggestedAction = ChatActionCard["actions"][number];

interface SessionView {
  query: string;
  archived: boolean;
  offset: number;
}

interface ChatUploadAttempt {
  id: string;
  file: File;
  status: "uploading" | "failed";
  error?: string;
}

interface InterruptedResponse {
  kind: "stopped" | "disconnected" | "failed";
  detail?: string;
  retry?: { text: string; uploads: ChatUploadResponse[] };
}

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
  const [uploadAttempts, setUploadAttempts] = useState<ChatUploadAttempt[]>([]);
  const uploadBatchRef = useRef<symbol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<InterruptedResponse | null>(
    null,
  );
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
  const navigationCollapsed = useStudioNavigationCollapsed();
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTrigger = useRef<HTMLSpanElement>(null);
  const sessionPickerTrigger = useRef<HTMLSpanElement>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const activeStreamRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      uploadBatchRef.current = null;
      const active = activeStreamRef.current;
      activeStreamRef.current = null;
      active?.abort();
    };
  }, []);
  const handledHandoffRef = useRef<string | null>(null);
  const adoptedSessionRef = useRef<string | null>(null);

  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionView, setSessionView] = useState<SessionView>({
    query: "",
    archived: false,
    offset: 0,
  });
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setSessionView((current) =>
          current.query === sessionSearch.trim()
            ? current
            : { ...current, query: sessionSearch.trim(), offset: 0 },
        ),
      250,
    );
    return (): void => window.clearTimeout(timer);
  }, [sessionSearch]);
  const sessionsQuery = useQuery({
    queryKey: [...studioChatKeys.sessions, sessionView],
    queryFn: () => chatClient.listSessions(sessionView),
  });
  const messagesQuery = useQuery({
    queryKey: studioChatKeys.messages(props.sessionId ?? ""),
    queryFn: () => chatClient.getMessages(props.sessionId ?? ""),
    // A newly accepted session already has an optimistic copy of its first
    // turn. Wait for the completed stream to replace that copy atomically.
    enabled:
      props.sessionId !== null && !sending && pendingMessages.length === 0,
  });
  const sessions = sessionsQuery.data ?? [];
  const storedMessages = messagesQuery.data ?? [];
  const currentSession =
    sessions.find((session) => session.id === props.sessionId) ??
    queryClient
      .getQueriesData<ChatSession[]>({ queryKey: studioChatKeys.sessions })
      .flatMap(([, items]) => items ?? [])
      .find((session) => session.id === props.sessionId);
  const archivedSession = currentSession?.archived === true;
  const sessionControls = {
    search: sessionSearch,
    view: sessionView,
    error: sessionsQuery.error ? "Sessions could not be loaded." : null,
    onRetry: (): void => {
      void sessionsQuery.refetch();
    },
    onSearch: setSessionSearch,
    onView: setSessionView,
  };
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
    setDetailsOpen(false);
    setSessionPickerOpen(false);
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
    uploadBatchRef.current = null;
    setUploadAttempts([]);
    setArchiving(false);
    setError(null);
    setInterrupted(null);
  }, [props.sessionId]);

  useEffect(() => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
  }, [props.sessionId]);

  useEffect(() => {
    const scroll = threadScrollRef.current;
    const manuscript = scroll?.firstElementChild;
    if (!scroll || !manuscript) return;
    const follow = (): void => {
      if (followLatestRef.current) scroll.scrollTop = scroll.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(manuscript);
    return (): void => observer.disconnect();
  }, []);

  useEffect(() => {
    if (followLatestRef.current) {
      const scroll = threadScrollRef.current;
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }
  }, [stream, visibleMessages.length]);

  const navigateToSession = useCallback(
    (conversationId?: string, preserveWork = false): void => {
      props.navigate(
        studioChatWorkspacePath(props.studioBasePath, conversationId),
        { preserveWork },
      );
      setSessionPickerOpen(false);
      setDetailsOpen(false);
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
      retry?: InterruptedResponse["retry"],
    ): Promise<boolean> => {
      activeStreamRef.current?.abort();
      const controller = new AbortController();
      activeStreamRef.current = controller;
      setSending(true);
      setError(null);
      setInterrupted(null);
      let stoppedByServer = false;
      let next: StudioChatStreamState = {
        ...createStudioChatStreamState(),
        messageId: crypto.randomUUID(),
      };
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
          if (event.type === "abort") stoppedByServer = true;
          next = reduceStudioChatStream(next, event);
          setStream(next);
        }
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        if (
          controller.signal.aborted ||
          stoppedByServer ||
          next.error !== null ||
          !next.finished
        ) {
          setInterrupted({
            kind:
              controller.signal.aborted || stoppedByServer
                ? "stopped"
                : next.error !== null
                  ? "failed"
                  : "disconnected",
            ...(next.error ? { detail: next.error } : {}),
            ...(retry ? { retry } : {}),
          });
          return accepted;
        }
        try {
          const authoritativeMessages =
            await chatClient.getMessages(conversationId);
          if (activeStreamRef.current !== controller) return accepted;
          queryClient.setQueryData(
            studioChatKeys.messages(conversationId),
            authoritativeMessages,
          );
          setPendingMessages([]);
          // History now owns the completed turn, including its approvals.
          // Keep the live state only when this read fails.
          setStream(null);
        } catch {
          // The completed response remains visible from the optimistic state;
          // a later session visit can retry the authoritative history read.
        }
        await queryClient.invalidateQueries({
          queryKey: studioChatKeys.sessions,
        });
      } catch (cause) {
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        setInterrupted({
          kind: controller.signal.aborted
            ? "stopped"
            : accepted
              ? "disconnected"
              : "failed",
          ...(!controller.signal.aborted
            ? {
                detail: errorMessage(
                  cause,
                  "Chat could not complete the response",
                ),
              }
            : {}),
          ...(retry ? { retry } : {}),
        });
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
      if (
        (!text && uploads.length === 0) ||
        sending ||
        uploading ||
        uploadAttempts.length > 0
      )
        return;
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
          content: text,
          cards: uploads.map((upload): ChatCard => ({
            kind: "attachment",
            id: upload.id,
            title: upload.filename,
            attachment: {
              mediaType: upload.mediaType,
              filename: upload.filename,
              sizeBytes: upload.sizeBytes,
              url: upload.url,
              downloadUrl: upload.downloadUrl,
            },
          })),
        },
      ]);
      // The transcript owns the message from here, so the composer empties now
      // rather than when the server answers; a refusal puts the draft back. A
      // suggested action carries its own prompt and never empties the composer.
      const sentUploads = [...uploads];
      const held = draftStore.read(draftKey);
      const sentFromComposer = held.text === prompt;
      if (sentFromComposer || sentUploads.length > 0)
        draftStore.update(draftKey, {
          text: sentFromComposer ? "" : held.text,
          uploads: held.uploads.filter(
            (upload) => !sentUploads.some((sent) => sent.id === upload.id),
          ),
        });
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
        },
        { text: prompt, uploads: [...uploads] },
      );
      if (
        !accepted &&
        (currentDraftKey.current === sentKey ||
          (!props.sessionId && currentDraftKey.current === draftKey))
      ) {
        setPendingMessages((current) =>
          current.filter((message) => message.id !== messageId),
        );
        // Restore into whichever conversation the composer now shows, keeping
        // anything typed while the request was in flight.
        const key = currentDraftKey.current;
        const current = draftStore.read(key);
        draftStore.update(key, {
          ...(sentFromComposer && !current.text ? { text: prompt } : {}),
          uploads: [
            ...sentUploads.filter(
              (upload) =>
                !current.uploads.some((kept) => kept.id === upload.id),
            ),
            ...current.uploads,
          ],
        });
      }
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
      uploadAttempts.length,
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

  const runUploads = useCallback(
    async (attempts: ChatUploadAttempt[]): Promise<void> => {
      if (uploadBatchRef.current || attempts.length === 0) return;
      const batch = Symbol();
      uploadBatchRef.current = batch;
      setUploading(true);
      setUploadAttempts((current) => [
        ...current.filter(
          (item) => !attempts.some((attempt) => attempt.id === item.id),
        ),
        ...attempts.map((attempt): ChatUploadAttempt => ({
          id: attempt.id,
          file: attempt.file,
          status: "uploading",
        })),
      ]);
      await Promise.all(
        attempts.map(async (attempt): Promise<void> => {
          try {
            const upload = await chatClient.upload(
              attempt.file,
              attempt.file.name,
            );
            if (
              uploadBatchRef.current !== batch ||
              currentDraftKey.current !== draftKey
            )
              return;
            setUploads((current) => [...current, upload]);
            setUploadAttempts((current) =>
              current.filter((item) => item.id !== attempt.id),
            );
          } catch (cause) {
            if (
              uploadBatchRef.current !== batch ||
              currentDraftKey.current !== draftKey
            )
              return;
            setUploadAttempts((current) =>
              current.map((item) =>
                item.id === attempt.id
                  ? {
                      ...item,
                      status: "failed",
                      error: errorMessage(cause, "Upload failed"),
                    }
                  : item,
              ),
            );
          }
        }),
      );
      if (uploadBatchRef.current === batch) {
        uploadBatchRef.current = null;
        setUploading(false);
      }
    },
    [chatClient, draftKey, setUploads],
  );

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await runUploads(
        files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "uploading",
        })),
      );
    },
    [runUploads],
  );

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
                    loading={sessionsQuery.isPending}
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
                onScroll={(event) => {
                  const scroll = event.currentTarget;
                  const nearBottom =
                    scroll.scrollHeight -
                      scroll.clientHeight -
                      scroll.scrollTop <=
                    48;
                  followLatestRef.current = nearBottom;
                  setShowJumpToLatest(!nearBottom);
                }}
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
                  <div ref={threadEndRef} />
                </div>
              </div>
              <Composer
                onJumpToLatest={
                  showJumpToLatest
                    ? (): void => {
                        followLatestRef.current = true;
                        setShowJumpToLatest(false);
                        const scroll = threadScrollRef.current;
                        if (scroll) {
                          scroll.focus({ preventScroll: true });
                          scroll.scrollTop = scroll.scrollHeight;
                        }
                      }
                    : undefined
                }
                draft={draft}
                sending={sending}
                uploading={uploading}
                uploads={uploads}
                uploadAttempts={uploadAttempts}
                onRetryUpload={(attempt) => void runUploads([attempt])}
                onDismissUpload={(id) =>
                  setUploadAttempts((current) =>
                    current.filter((attempt) => attempt.id !== id),
                  )
                }
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
  sessions: ChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  search: string;
  view: SessionView;
  error: string | null;
  onRetry: () => void;
  onSearch: (search: string) => void;
  onView: (view: SessionView) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <aside
      className={chatClass("studio-chat-session-picker", chatLayout.picker)}
      aria-label="Chat sessions"
    >
      {
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
                typographyStyles.section,
              )}
            >
              History
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
      }
      <div
        className={chatClass(
          "studio-chat-session-controls",
          chatLayout.sessionControls,
        )}
      >
        <StudioCollectionBar
          label="Conversation search and filters"
          searchLabel="Search conversations"
          search={props.search}
          onSearch={props.onSearch}
          filterLabel="Filter"
          filterCount={props.view.archived ? 1 : 0}
          filtered={Boolean(props.view.query) || props.view.archived}
          onClear={() => {
            props.onSearch("");
            props.onView({
              ...props.view,
              query: "",
              archived: false,
              offset: 0,
            });
          }}
        >
          <NativeSelect
            aria-label="Show conversations"
            value={props.view.archived ? "archived" : "active"}
            onChange={(event) =>
              props.onView({
                ...props.view,
                archived: event.target.value === "archived",
                offset: 0,
              })
            }
          >
            <option value="active">Active conversations</option>
            <option value="archived">Archived conversations</option>
          </NativeSelect>
        </StudioCollectionBar>
        {(props.view.offset > 0 || props.sessions.length > 0) && (
          <StudioCollectionPager
            label="Conversation pages"
            offset={props.view.offset}
            count={props.sessions.length}
            loading={props.loading}
            hasNext={props.sessions.length >= 25}
            onPrevious={() =>
              props.onView({
                ...props.view,
                offset: Math.max(0, props.view.offset - 25),
              })
            }
            onNext={() =>
              props.onView({ ...props.view, offset: props.view.offset + 25 })
            }
          />
        )}
        {props.error && (
          <p role="alert">
            {props.error}{" "}
            <Button type="button" variant="ghost" onClick={props.onRetry}>
              Retry sessions
            </Button>
          </p>
        )}
      </div>
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
        {!props.loading && !props.error && props.sessions.length === 0 ? (
          <p className={chatClass("studio-chat-empty", chatLayout.empty)}>
            {props.view.query
              ? "No conversations match this search."
              : props.view.offset > 0
                ? "No more conversations."
                : props.view.archived
                  ? "No archived conversations."
                  : "No conversations yet."}
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
  disabled: boolean;
  message: ChatHistoryMessage;
  client: ChatClient;
  onAction: (action: ChatSuggestedAction) => Promise<void>;
  onApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
}): ReactElement {
  return (
    <article
      className={chatClass(
        "studio-chat-turn",
        chatLayout.turn,
        props.message.role === "user" && chatLayout.userTurn,
      )}
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
            <StudioMarkdown
              className={chatClass("studio-chat-prose", chatLayout.cards)}
              presentation="chat"
            >
              {props.message.content}
            </StudioMarkdown>
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
                client={props.client}
                disabled={props.disabled}
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
  disabled: boolean;
  card: ChatCard;
  client: ChatClient;
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
              disabled={props.disabled}
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
      <details className={chatClass("studio-chat-sources", chatLayout.card)}>
        <summary>{card.title ?? `${card.sources.length} sources`}</summary>
        <ul>
          {card.sources.map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a href={source.url}>{source.title ?? source.source}</a>
              ) : (
                (source.title ?? source.source)
              )}
              {source.excerpt && (
                <p className={chatClass("", chatLayout.paragraph)}>
                  {source.excerpt}
                </p>
              )}
              <details>
                <summary>Source details</summary>
                <pre className={chatClass("", chatLayout.source)}>
                  {JSON.stringify(source, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  if (card.kind === "attachment") {
    return <StudioChatAttachment card={card} client={props.client} />;
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
        {pending
          ? "Approval required"
          : card.state === "approval-responded"
            ? "Decision received · awaiting result"
            : card.state === "output-available"
              ? "Completed"
              : card.state === "output-denied"
                ? "Declined"
                : "Action failed"}
      </span>
      <strong>{card.summary}</strong>
      {card.completionSummary && <p>{card.completionSummary}</p>}
      {card.error !== undefined && <p role="alert">{card.error}</p>}
      {(card.preview !== undefined || card.input !== undefined) && (
        <details>
          <summary>Review exact action</summary>
          <pre
            className={chatClass("studio-chat-card-preview", chatLayout.source)}
          >
            {card.preview ?? JSON.stringify(card.input, null, 2)}
          </pre>
          {card.preview !== undefined && card.input !== undefined && (
            <details>
              <summary>Tool input</summary>
              <pre className={chatClass("", chatLayout.source)}>
                {JSON.stringify(card.input, null, 2)}
              </pre>
            </details>
          )}
          <p className={chatClass("", chatLayout.cardText)}>
            Tool: {card.toolName}
          </p>
        </details>
      )}
      {card.output !== undefined && (
        <details>
          <summary>Action result</summary>
          <pre className={chatClass("", chatLayout.source)}>
            {typeof card.output === "string"
              ? card.output
              : JSON.stringify(card.output, null, 2)}
          </pre>
        </details>
      )}
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
            disabled={props.disabled}
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
            disabled={props.disabled}
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
      {props.approval.input !== undefined && (
        <details>
          <summary>Review exact action</summary>
          <pre className={chatClass("", chatLayout.source)}>
            {JSON.stringify(props.approval.input, null, 2)}
          </pre>
          <p>Tool: {props.approval.toolName}</p>
        </details>
      )}
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
  uploadAttempts: ChatUploadAttempt[];
  onRetryUpload: (attempt: ChatUploadAttempt) => void;
  onDismissUpload: (id: string) => void;
  sending: boolean;
  uploading: boolean;
  onDraft: (value: string) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop?: (() => void) | undefined;
  onJumpToLatest?: (() => void) | undefined;
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
      {props.onJumpToLatest && (
        <Button type="button" variant="ghost" onClick={props.onJumpToLatest}>
          Jump to latest ↓
        </Button>
      )}
      <form
        className={chatClass("studio-chat-composer-form", chatLayout.form)}
        onSubmit={props.onSubmit}
      >
        {(props.uploadAttempts.length > 0 || props.uploads.length > 0) && (
          <div
            className={chatClass(
              "studio-chat-upload-strip",
              chatLayout.uploadStrip,
            )}
            role="region"
            aria-label="Draft attachments"
            tabIndex={0}
          >
            <ul
              className={chatClass(
                "studio-chat-upload-list",
                chatLayout.uploadList,
              )}
              aria-label={
                props.uploadAttempts.length > 0
                  ? "File upload progress"
                  : "Attached files"
              }
            >
              {props.uploadAttempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className={chatClass("studio-chat-upload", chatLayout.upload)}
                >
                  <div className={chatClass("", chatLayout.uploadName)}>
                    <span
                      role={attempt.status === "failed" ? "alert" : "status"}
                    >
                      {attempt.file.name}:{" "}
                      {attempt.status === "uploading"
                        ? "Uploading…"
                        : (attempt.error ?? "Upload failed")}
                    </span>
                    {attempt.status === "uploading" && (
                      <progress aria-label={`Uploading ${attempt.file.name}`} />
                    )}
                  </div>
                  {attempt.status === "failed" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        xstyle={chatLayout.toolbarButton}
                        aria-label={`Retry uploading ${attempt.file.name}`}
                        disabled={
                          props.uploading || props.sending || props.locked
                        }
                        onClick={() => props.onRetryUpload(attempt)}
                      >
                        Retry
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        xstyle={chatLayout.toolbarButton}
                        aria-label={`Dismiss failed upload ${attempt.file.name}`}
                        onClick={() => props.onDismissUpload(attempt.id)}
                      >
                        ×
                      </Button>
                    </>
                  )}
                </li>
              ))}
              {props.uploads.map((upload) => (
                <li
                  className={chatClass("studio-chat-upload", chatLayout.upload)}
                  key={upload.id}
                >
                  <DraftUploadPreview upload={upload} />
                  <span className={chatClass("", chatLayout.uploadName)}>
                    {upload.filename}
                    <br />
                    Ready · draft only
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={chatLayout.toolbarButton}
                    aria-label={`Remove ${upload.filename} from message`}
                    disabled={props.locked}
                    onClick={() => props.onRemoveUpload(upload.id)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <textarea
          className={chatClass("studio-chat-message", chatLayout.input)}
          aria-label="Message"
          aria-describedby="studio-chat-composer-hint"
          placeholder="Message…"
          value={props.draft}
          disabled={props.locked}
          onChange={(event) => props.onDraft(event.target.value)}
          onKeyDown={keyDown}
        />
        <div
          className={chatClass(
            "studio-chat-composer-actions",
            chatLayout.composerBar,
          )}
        >
          <label
            className={chatClass(
              "studio-chat-composer-action",
              chatLayout.attachButton,
            )}
            title={CHAT_UPLOAD_GUIDANCE}
          >
            <span aria-hidden="true">+</span>
            <input
              className={chatClass(
                "studio-chat-upload-input",
                chatLayout.uploadInput,
              )}
              aria-label="Attach files"
              type="file"
              accept={messageUploadAccept}
              multiple
              disabled={props.locked || props.sending || props.uploading}
              onChange={(event) => void props.onFiles(event)}
            />
          </label>
          {props.uploadAttempts.length > 0 && (
            <span className={chatClass("", chatLayout.kicker)}>
              Resolve uploads before sending
            </span>
          )}
          {props.locked ? (
            <Button type="button" disabled>
              Archiving…
            </Button>
          ) : props.sending ? (
            <Button
              type="button"
              variant="outline"
              xstyle={chatLayout.toolbarButton}
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
              xstyle={chatLayout.toolbarButton}
              aria-label="Send message"
              disabled={
                props.uploading ||
                props.uploadAttempts.length > 0 ||
                (!props.draft.trim() && props.uploads.length === 0)
              }
            >
              ↑
            </Button>
          )}
        </div>
      </form>
      <small
        id="studio-chat-composer-hint"
        className={chatClass(
          "studio-chat-composer-hint",
          chatLayout.composerHint,
        )}
      >
        Enter to send · Shift+Enter for a new line
      </small>
    </footer>
  );
}

function DraftUploadPreview({
  upload,
}: {
  upload: ChatUploadResponse;
}): ReactElement | null {
  const [failed, setFailed] = useState(false);
  if (failed || !upload.mediaType.startsWith("image/")) return null;
  return (
    <img
      className={chatClass(
        "studio-chat-draft-preview",
        chatLayout.uploadPreview,
      )}
      src={upload.url}
      alt={upload.filename}
      onError={() => setFailed(true)}
    />
  );
}

function ConversationContext(props: {
  cards: ChatCard[];
  progress: StudioChatStreamState["progress"];
  session: ChatSession | undefined;
}): ReactElement {
  return (
    <aside
      className={chatClass("studio-chat-context", chatLayout.contextBody)}
      tabIndex={0}
      aria-label="Conversation sources and attachments"
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
                typographyStyles.section,
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
            No sources or attachments in this conversation yet.
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
                typographyStyles.section,
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
                typographyStyles.section,
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
