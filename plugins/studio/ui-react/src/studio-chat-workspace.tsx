/** @jsxImportSource react */
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
import { styles } from "./app-styles";
import {
  approvalResponseMessage,
  createStudioChatStreamState,
  reduceStudioChatStream,
  streamAssistantMessage,
  type StudioChatApproval,
  type StudioChatStreamState,
} from "./chat-workspace-model";
import responsiveStyles from "./responsive.css" with { type: "text" };
import { TypeSwitcher } from "./entity-fields";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import chromeStyles from "./studio-chrome.css" with { type: "text" };
import chatStyles from "./studio-chat-workspace.css" with { type: "text" };
import pageHeadStyles from "./studio-page-head.css" with { type: "text" };
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };

const studioChatKeys = {
  sessions: ["studio", "chat", "sessions"] as const,
  messages: (conversationId: string) =>
    ["studio", "chat", "messages", conversationId] as const,
};

type ChatActionCard = Extract<ChatCard, { kind: "actions" }>;
type ChatSuggestedAction = ChatActionCard["actions"][number];

export interface StudioChatWorkspaceProps {
  apiPath?: string | undefined;
  studioBasePath: string;
  sessionId: string | null;
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  handoff: StudioChatHandoff | null;
  navigate: (href: string) => void;
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
  const [draft, setDraft] = useState("");
  const [pendingMessages, setPendingMessages] = useState<ChatHistoryMessage[]>(
    [],
  );
  const [stream, setStream] = useState<StudioChatStreamState | null>(null);
  const [uploads, setUploads] = useState<ChatUploadResponse[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationCollapsed = useStudioNavigationCollapsed();
  const [contextOpen, setContextOpen] = useState(false);
  const [mobileDestination, setMobileDestination] = useState<
    "sessions" | "thread" | "context"
  >("thread");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
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
    setPendingMessages([]);
    setStream(null);
    setUploads([]);
    setError(null);
  }, [props.sessionId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [stream?.text, visibleMessages.length]);

  const navigateToSession = useCallback(
    (conversationId?: string): void => {
      props.navigate(
        studioChatWorkspacePath(props.studioBasePath, conversationId),
      );
      setMobileDestination("thread");
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
      .then(({ conversationId }) => navigateToSession(conversationId))
      .catch((cause: unknown) => {
        handledHandoffRef.current = null;
        setError(errorMessage(cause, "Context could not be attached"));
      });
  }, [chatClient, navigateToSession, props.handoff, props.sessionId]);

  const runStream = useCallback(
    async (conversationId: string, messages: ChatMessage[]): Promise<void> => {
      setSending(true);
      setError(null);
      let next = createStudioChatStreamState();
      setStream(next);
      try {
        const response = await chatClient.streamMessages({
          id: conversationId,
          messages,
          trigger: "submit-message",
        });
        for await (const event of readChatProtocolEvents(response)) {
          next = reduceStudioChatStream(next, event);
          setStream(next);
        }
        if (next.text || next.cards.length > 0) {
          setPendingMessages((current) => [
            ...current,
            streamAssistantMessage(next),
          ]);
          setStream({ ...next, text: "", cards: [] });
        }
        await queryClient.invalidateQueries({
          queryKey: studioChatKeys.sessions,
        });
      } catch (cause) {
        setError(errorMessage(cause, "Chat could not complete the response"));
      } finally {
        setSending(false);
      }
    },
    [chatClient, queryClient],
  );

  const submitPrompt = useCallback(
    async (prompt: string): Promise<void> => {
      const text = prompt.trim();
      if ((!text && uploads.length === 0) || sending || uploading) return;
      const conversationId = props.sessionId ?? `web-${crypto.randomUUID()}`;
      if (!props.sessionId) {
        adoptedSessionRef.current = conversationId;
        navigateToSession(conversationId);
      }
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
      setDraft("");
      setUploads([]);
      await runStream(conversationId, [{ id: messageId, role: "user", parts }]);
    },
    [
      navigateToSession,
      props.sessionId,
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
        setError(errorMessage(cause, "Chat action failed"));
      } finally {
        setSending(false);
      }
    },
    [chatClient, props.sessionId, sending, submitPrompt],
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
        setError(errorMessage(cause, "Upload failed"));
      } finally {
        setUploading(false);
      }
    },
    [chatClient],
  );

  const archiveCurrent = useCallback(async (): Promise<void> => {
    if (!props.sessionId || sending) return;
    try {
      await chatClient.archiveSession(props.sessionId);
      await queryClient.invalidateQueries({
        queryKey: studioChatKeys.sessions,
      });
      navigateToSession();
    } catch (cause) {
      setError(errorMessage(cause, "Conversation could not be archived"));
    }
  }, [chatClient, navigateToSession, props.sessionId, queryClient, sending]);

  const workspaceBadges = Object.fromEntries(
    props.workspaces.flatMap((workspace) =>
      workspace.badge === undefined ? [] : [[workspace.id, workspace.badge]],
    ),
  );

  return (
    <div className="studio" data-view="chat">
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}\n${chromeStyles}\n${pageHeadStyles}\n${chatStyles}`}</style>
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
        <div
          className="studio-chat-room"
          data-context-open={contextOpen ? "true" : "false"}
          data-mobile-destination={mobileDestination}
        >
          <SessionRail
            activeSessionId={props.sessionId}
            loading={sessionsQuery.isPending}
            sessions={sessions}
            onNew={() => navigateToSession()}
            onSelect={navigateToSession}
          />
          <section className="studio-chat-thread" aria-label="Conversation">
            <header className="studio-chat-thread-head">
              <div className="studio-chat-head-copy">
                <h2>{currentSession?.title ?? "New conversation"}</h2>
                <p>
                  {props.sessionId
                    ? "Durable Studio conversation"
                    : "Start with a question or attach a source"}
                </p>
              </div>
              {props.sessionId ? (
                <button
                  className="studio-chat-header-action"
                  type="button"
                  onClick={() => void archiveCurrent()}
                >
                  Archive
                </button>
              ) : null}
              <button
                className="studio-chat-header-action"
                type="button"
                aria-expanded={contextOpen || mobileDestination === "context"}
                onClick={() => {
                  setContextOpen((open) => !open);
                  setMobileDestination("context");
                }}
              >
                Context
              </button>
            </header>
            <div className="studio-chat-thread-scroll">
              <div className="studio-chat-manuscript">
                {messagesQuery.isPending && props.sessionId ? (
                  <p className="studio-chat-empty">Opening conversation…</p>
                ) : null}
                {!messagesQuery.isPending && visibleMessages.length === 0 ? (
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
                  <p className="studio-chat-stream-status" role="status">
                    Working in this conversation
                  </p>
                ) : null}
                {error ? (
                  <p className="studio-chat-error" role="alert">
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
              onFiles={uploadFiles}
              onSubmit={submit}
            />
          </section>
          <ContextRail
            cards={contextCards}
            messages={visibleMessages}
            progress={stream?.progress ?? []}
            session={currentSession}
            onClose={() => {
              setContextOpen(false);
              setMobileDestination("thread");
            }}
          />
          <nav
            className="studio-chat-mobile-destinations"
            aria-label="Chat destinations"
          >
            {(["sessions", "thread", "context"] as const).map((destination) => (
              <button
                className="studio-chat-mobile-destination"
                data-active={
                  mobileDestination === destination ? "true" : "false"
                }
                type="button"
                key={destination}
                onClick={() => setMobileDestination(destination)}
              >
                {destination === "thread" ? "Chat" : destination}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

function SessionRail(props: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <aside className="studio-chat-sessions" aria-label="Chat sessions">
      <header className="studio-chat-sessions-head">
        <div className="studio-chat-head-copy">
          <h1>Chat</h1>
          <p>{props.sessions.length} open conversations</p>
        </div>
        <button
          className="studio-chat-new"
          type="button"
          aria-label="New conversation"
          onClick={props.onNew}
        >
          +
        </button>
      </header>
      <div className="studio-chat-session-list">
        {props.loading ? (
          <p className="studio-chat-empty">Loading sessions…</p>
        ) : null}
        {!props.loading && props.sessions.length === 0 ? (
          <p className="studio-chat-empty">No conversations yet.</p>
        ) : null}
        {props.sessions.map((session) => (
          <button
            className="studio-chat-session"
            data-active={
              session.id === props.activeSessionId ? "true" : "false"
            }
            type="button"
            key={session.id}
            onClick={() => props.onSelect(session.id)}
          >
            <strong>{session.title}</strong>
            <time dateTime={session.lastActiveAt}>
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
    <section className="studio-chat-empty" aria-label="New conversation">
      <span className="studio-chat-card-kicker">Working room</span>
      <h2>Start with the work, not the interface.</h2>
      <p>
        Ask a question, attach a source, or continue a decision. The resulting
        conversation stays inspectable alongside its context and artifacts.
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
    <article className="studio-chat-turn" data-role={props.message.role}>
      <span className="studio-chat-turn-label">
        {props.message.role === "user" ? "You" : "Rizom"}
      </span>
      <div className="studio-chat-turn-body">
        {props.message.content ? (
          props.message.role === "assistant" ? (
            <Streamdown>{props.message.content}</Streamdown>
          ) : (
            <p>{props.message.content}</p>
          )
        ) : null}
        {props.message.attachments?.map((attachment) => (
          <p
            className="studio-chat-upload"
            key={`${attachment.filename}-${attachment.createdAt}`}
          >
            {attachment.filename}
          </p>
        ))}
        {props.message.cards?.length ? (
          <div className="studio-chat-cards">
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
      <section className="studio-chat-card">
        <span className="studio-chat-card-kicker">Actions</span>
        {card.title ? <strong>{card.title}</strong> : null}
        <div className="studio-chat-card-actions">
          {card.actions.map((action) => (
            <button
              className="studio-chat-card-action"
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
      <section className="studio-chat-card">
        <span className="studio-chat-card-kicker">Sources</span>
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
      <section className="studio-chat-card">
        <span className="studio-chat-card-kicker">Artifact</span>
        <strong>{card.title}</strong>
        {card.description ? <p>{card.description}</p> : null}
        {card.attachment.previewUrl || card.attachment.downloadUrl ? (
          <div className="studio-chat-card-actions">
            <a
              className="studio-chat-card-action"
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
    <section className="studio-chat-card">
      <span className="studio-chat-card-kicker">
        {pending ? "Approval required" : "Approval record"}
      </span>
      <strong>{card.summary}</strong>
      {card.preview ? <p>{card.preview}</p> : null}
      {pending ? (
        <div className="studio-chat-approval-actions">
          <button
            className="studio-chat-approval-action"
            type="button"
            onClick={() => void props.onApproval(approval, false)}
          >
            Decline
          </button>
          <button
            className="studio-chat-approval-action"
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
    <section className="studio-chat-approval">
      <span className="studio-chat-card-kicker">Approval required</span>
      <strong>{props.approval.title ?? props.approval.toolName}</strong>
      <div className="studio-chat-approval-actions">
        <button
          className="studio-chat-approval-action"
          type="button"
          disabled={props.disabled}
          onClick={() => void props.onDecision(props.approval, false)}
        >
          Decline
        </button>
        <button
          className="studio-chat-approval-action"
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
  draft: string;
  uploads: ChatUploadResponse[];
  sending: boolean;
  uploading: boolean;
  onDraft: (value: string) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactElement {
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  return (
    <footer className="studio-chat-composer">
      {props.uploads.length > 0 ? (
        <div className="studio-chat-upload-list">
          {props.uploads.map((upload) => (
            <span className="studio-chat-upload" key={upload.id}>
              {upload.filename}
            </span>
          ))}
        </div>
      ) : null}
      <form className="studio-chat-composer-form" onSubmit={props.onSubmit}>
        <label
          className="studio-chat-composer-action"
          aria-label="Attach files"
        >
          +
          <input
            className="studio-chat-upload-input"
            type="file"
            multiple
            disabled={props.sending || props.uploading}
            onChange={(event) => void props.onFiles(event)}
          />
        </label>
        <textarea
          aria-label="Message"
          placeholder="Continue the conversation…"
          value={props.draft}
          disabled={props.sending}
          onChange={(event) => props.onDraft(event.target.value)}
          onKeyDown={keyDown}
        />
        <button
          className="studio-chat-composer-action"
          data-primary="true"
          type="submit"
          aria-label="Send message"
          disabled={
            props.sending ||
            props.uploading ||
            (!props.draft.trim() && props.uploads.length === 0)
          }
        >
          ↑
        </button>
      </form>
    </footer>
  );
}

function ContextRail(props: {
  cards: ChatCard[];
  messages: ChatHistoryMessage[];
  progress: StudioChatStreamState["progress"];
  session: ChatSession | undefined;
  onClose: () => void;
}): ReactElement {
  return (
    <aside className="studio-chat-context" aria-label="Working set">
      <header className="studio-chat-context-head">
        <h2>Working set</h2>
        <span className="spacer" />
        <button
          className="studio-chat-context-action"
          type="button"
          aria-label="Close context"
          onClick={props.onClose}
        >
          ×
        </button>
      </header>
      <div className="studio-chat-context-list">
        {props.session?.contextHandoff ? (
          <section className="studio-chat-context-card">
            <span className="studio-chat-context-kicker">Linked context</span>
            <h3>{props.session.contextHandoff.titleSeed}</h3>
            <p>
              {props.session.contextHandoff.sourceId} ·{" "}
              {props.session.contextHandoff.itemId}
            </p>
          </section>
        ) : null}
        {props.cards.length === 0 && props.progress.length === 0 ? (
          <p className="studio-chat-empty">
            Sources, artifacts, and durable jobs appear here as the conversation
            develops.
          </p>
        ) : null}
        {props.cards.map((card, index) => (
          <section
            className="studio-chat-context-card"
            key={`${card.kind}-${card.id}-${index}`}
          >
            <span className="studio-chat-context-kicker">
              {card.kind === "sources" ? "Sources" : "Artifact"}
            </span>
            <h3>
              {card.kind === "sources"
                ? (card.title ?? `${card.sources.length} consulted`)
                : card.kind === "attachment"
                  ? card.title
                  : "Conversation context"}
            </h3>
            {card.kind === "sources" ? (
              <ul>
                {card.sources.slice(0, 5).map((source) => (
                  <li key={source.id}>{source.title ?? source.source}</li>
                ))}
              </ul>
            ) : card.kind === "attachment" && card.description ? (
              <p>{card.description}</p>
            ) : null}
          </section>
        ))}
        {props.progress.map((item, index) => (
          <section
            className="studio-chat-context-card"
            key={`${item.type}-${index}`}
          >
            <span className="studio-chat-context-kicker">Durable job</span>
            <h3>{item.operationTarget ?? item.operationType}</h3>
            <p>{item.message ?? item.status}</p>
          </section>
        ))}
        {props.messages.length > 0 ? (
          <section className="studio-chat-context-card">
            <span className="studio-chat-context-kicker">Activity</span>
            <h3>Conversation current</h3>
            <p>{props.messages.length} durable turns in this working room.</p>
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
