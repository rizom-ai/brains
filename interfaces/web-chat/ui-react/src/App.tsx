/** @jsxImportSource react */
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chat, useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatStatus,
  type FileUIPart,
  type UIMessage,
} from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./ai-elements/conversation";
import {
  AttachmentPart,
  ConfirmationPart,
  GenericDataPart,
  NativeToolPart,
  ToolCallsGroup,
  ToolResultPart,
} from "./ai-elements/data-parts";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "./ai-elements/prompt-input";
import {
  createUploadMessageParts,
  parseUploadPartData,
  uploadFilePart,
} from "./uploads";

const conversationStorageKey = "brain:web-chat:conversation-id";
const themeStorageKey = "brain:theme";
const uploadAccept =
  ".md,.txt,.markdown,text/plain,text/markdown,text/x-markdown";
const uploadMaxFileSize = 100_000;

type ThemeMode = "light" | "dark";
type AsyncStatus = "idle" | "loading" | "ready" | "error";
type SessionDialog =
  | { kind: "rename"; session: WebChatSession }
  | { kind: "archive"; session: WebChatSession }
  | { kind: "delete"; session: WebChatSession }
  | null;
type UploadNotice = { tone: "success" | "error"; message: string } | null;

function getInitialTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    /* localStorage unavailable — fall back to in-memory only */
  }
}

function PromptAttachmentButton(): React.ReactElement {
  const attachments = usePromptInputAttachments();
  return (
    <button
      type="button"
      className="web-chat-prompt-attach"
      onClick={() => attachments.openFileDialog()}
    >
      Attach text
    </button>
  );
}

function PromptAttachmentList(): React.ReactElement | null {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <div className="web-chat-prompt-attachments" aria-label="Attached files">
      {attachments.files.map((file) => (
        <span className="web-chat-prompt-attachment" key={file.id}>
          <span>{file.filename ?? "upload.txt"}</span>
          <button
            type="button"
            aria-label={`Remove ${file.filename ?? "uploaded file"}`}
            onClick={() => attachments.remove(file.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function PromptSubmitControl({
  input,
  onStop,
  status,
}: {
  input: string;
  onStop: () => void;
  status: ChatStatus;
}): React.ReactElement {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={!input.trim() && attachments.files.length === 0}
    />
  );
}

const dayMs = 24 * 60 * 60 * 1000;
const sessionTitleMaxLength = 48;

interface WebChatSession {
  id: string;
  title: string;
  lastActiveAt: string;
}

interface WebChatHistoryMessage {
  id: string;
  role: UIMessage["role"];
  content: string;
}

interface WebChatSessionsResponse {
  sessions: WebChatSession[];
}

interface WebChatMessagesResponse {
  messages: WebChatHistoryMessage[];
}

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

function toUiMessage(message: WebChatHistoryMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

function getPartData(part: unknown): unknown {
  if (typeof part !== "object" || part === null || !("data" in part)) {
    return undefined;
  }
  return part.data;
}

type MessagePart = UIMessage["parts"][number];
type RenderedPart =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: unknown[] }
  | { kind: "confirmation"; data: unknown }
  | { kind: "native-tool"; data: unknown }
  | { kind: "attachment"; data: unknown }
  | { kind: "progress"; data: unknown }
  | { kind: "file"; filename: string; mediaType: string }
  | { kind: "generic"; type: string; data: unknown };

function groupMessageParts(parts: readonly MessagePart[]): RenderedPart[] {
  const out: RenderedPart[] = [];
  let toolRun: unknown[] = [];
  const flush = (): void => {
    if (toolRun.length === 0) return;
    out.push({ kind: "tools", tools: toolRun });
    toolRun = [];
  };
  for (const part of parts) {
    switch (part.type) {
      case "data-tool-result":
        toolRun.push(getPartData(part));
        continue;
      case "dynamic-tool":
        flush();
        out.push(
          part.state === "approval-requested"
            ? { kind: "confirmation", data: part }
            : { kind: "native-tool", data: part },
        );
        break;
      case "text":
        flush();
        out.push({ kind: "text", text: part.text });
        break;
      case "data-attachment":
        flush();
        out.push({ kind: "attachment", data: getPartData(part) });
        break;
      case "data-progress":
        flush();
        out.push({ kind: "progress", data: getPartData(part) });
        break;
      case "data-upload": {
        flush();
        const upload = parseUploadPartData(getPartData(part));
        if (upload) {
          out.push({
            kind: "file",
            filename: upload.filename,
            mediaType: upload.mediaType,
          });
        }
        break;
      }
      case "file":
        flush();
        out.push({
          kind: "file",
          filename: part.filename ?? "upload.txt",
          mediaType: part.mediaType,
        });
        break;
      default:
        flush();
        if (part.type.startsWith("data-")) {
          out.push({
            kind: "generic",
            type: part.type,
            data: getPartData(part),
          });
        }
        break;
    }
  }
  flush();
  return out;
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

function deriveSessionTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine) return "New conversation";
  if (firstLine.length <= sessionTitleMaxLength) return firstLine;
  return `${firstLine.slice(0, sessionTitleMaxLength - 1).trimEnd()}…`;
}

function formatSessionTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";
  const diff = now.getTime() - then.getTime();
  if (diff < dayMs && then.getDate() === now.getDate()) {
    return then.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now.getTime() - dayMs);
  if (then.getDate() === yesterday.getDate()) return "Yest";
  if (diff < 7 * dayMs) {
    return then.toLocaleDateString(undefined, { weekday: "short" });
  }
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function statusPhrase(status: string): string {
  if (status === "submitted") return "the rhizome is listening";
  if (status === "streaming") return "the rhizome is listening";
  if (status === "error") return "a thread broke mid-growth";
  return "";
}

function UploadedFilePart({
  filename,
  mediaType,
}: {
  filename: string;
  mediaType: string;
}): React.ReactElement {
  return (
    <span className="web-chat-uploaded-file" data-media-type={mediaType}>
      <span className="web-chat-uploaded-file-kicker">attached</span>
      <span className="web-chat-uploaded-file-name">{filename}</span>
    </span>
  );
}

interface ProgressData {
  status: "pending" | "processing" | "completed" | "failed";
  operationType: string;
  operationTarget?: string;
  message?: string;
  progress?: { current: number; total: number; percentage: number };
}

function isProgressData(data: unknown): data is ProgressData {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    typeof record["status"] === "string" &&
    ["pending", "processing", "completed", "failed"].includes(
      record["status"],
    ) &&
    typeof record["operationType"] === "string"
  );
}

function formatOperationType(operationType: string): string {
  return operationType
    .split("_")
    .filter((part) => part.length > 0)
    .join(" ");
}

function progressLabel(status: ProgressData["status"]): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
      return "queued";
    case "processing":
      return "processing";
  }
}

function ProgressPart({ data }: { data: unknown }): React.ReactElement | null {
  if (!isProgressData(data)) return null;
  const operation = formatOperationType(data.operationType);
  const title = data.operationTarget
    ? `${operation}: ${data.operationTarget}`
    : operation;
  const progress = data.progress;
  return (
    <section className="web-chat-progress-part" data-status={data.status}>
      <div className="web-chat-progress-kicker">
        {progressLabel(data.status)}
      </div>
      <div className="web-chat-progress-title">{title}</div>
      {data.message ? (
        <div className="web-chat-progress-message">{data.message}</div>
      ) : null}
      {progress ? (
        <div
          className="web-chat-progress-meter"
          aria-label={`${progress.percentage}% complete`}
        >
          <span
            style={
              {
                "--web-chat-progress-value": `${Math.max(0, Math.min(100, progress.percentage))}%`,
              } as CSSProperties
            }
          />
        </div>
      ) : null}
    </section>
  );
}

function describeFetchFailure(response: Response, fallback: string): string {
  if (response.status === 401 || response.status === 403) {
    return "Your operator session may have expired. Refresh or sign in again.";
  }
  return `${fallback} (${response.status})`;
}

export function App(): React.ReactElement {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState(() =>
    getBrowserConversationId(),
  );
  const [sessions, setSessions] = useState<WebChatSession[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<AsyncStatus>("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<
    string | null
  >(null);
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null);
  const [archivingConversationId, setArchivingConversationId] = useState<
    string | null
  >(null);
  const [renamingConversationId, setRenamingConversationId] = useState<
    string | null
  >(null);
  const [sessionDialog, setSessionDialog] = useState<SessionDialog>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<UploadNotice>(null);

  function closeDrawer(): void {
    setDrawerOpen(false);
  }

  function toggleTheme(): void {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
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

  useEffect(() => {
    if (promptInputRef.current) {
      resizePromptTextarea(promptInputRef.current);
    }
  }, [input]);

  useEffect(() => {
    focusPromptTextarea(promptInputRef.current);
    void loadSessions();
  }, []);

  async function loadSessions(
    options: { quiet?: boolean } = {},
  ): Promise<void> {
    if (!options.quiet) {
      setSessionsStatus("loading");
      setSessionError(null);
    }

    try {
      const response = await fetch("/api/chat/sessions", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(
          describeFetchFailure(response, "Could not load saved sessions."),
        );
      }
      const body = (await response.json()) as WebChatSessionsResponse;
      setSessions(body.sessions);
      setSessionsStatus("ready");
      setSessionError(null);
    } catch (error) {
      setSessionsStatus("error");
      setSessionError(
        error instanceof Error
          ? error.message
          : "Could not load saved sessions.",
      );
    }
  }

  function upsertPendingSession(text: string): void {
    const now = new Date().toISOString();
    const pendingSession: WebChatSession = {
      id: conversationId,
      title: deriveSessionTitle(text),
      lastActiveAt: now,
    };
    setSessions((current) => {
      const existingSession = current.find(
        (session) => session.id === conversationId,
      );
      const nextSession =
        existingSession && existingSession.title !== "New conversation"
          ? { ...existingSession, lastActiveAt: now }
          : pendingSession;
      const withoutCurrent = current.filter(
        (session) => session.id !== conversationId,
      );
      return [nextSession, ...withoutCurrent];
    });
  }

  async function switchConversation(nextConversationId: string): Promise<void> {
    if (isBusyStatus(status) || loadingConversationId) return;

    setHistoryError(null);
    setLoadingConversationId(nextConversationId);
    try {
      const response = await fetch(
        `/api/chat/messages?id=${encodeURIComponent(nextConversationId)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          describeFetchFailure(response, "Could not reopen that session."),
        );
      }
      const body = (await response.json()) as WebChatMessagesResponse;
      const nextMessages = body.messages.map(toUiMessage);
      try {
        localStorage.setItem(conversationStorageKey, nextConversationId);
      } catch {
        /* localStorage unavailable — switching still works in memory */
      }
      setMessages(nextMessages);
      setInitialMessages(nextMessages);
      setConversationId(nextConversationId);
      setInput("");
      closeDrawer();
      focusPromptTextarea(promptInputRef.current);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not reopen that session.",
      );
    } finally {
      setLoadingConversationId(null);
    }
  }

  async function submitMessage(
    textOverride?: string,
    files: FileUIPart[] = [],
  ): Promise<void> {
    const text = (textOverride ?? input).trim();
    if ((!text && files.length === 0) || isBusyStatus(status)) return;
    setHistoryError(null);

    let uploadedFiles: Awaited<ReturnType<typeof uploadFilePart>>[] = [];
    if (files.length > 0) {
      setUploadNotice({
        tone: "success",
        message: `Uploading ${files.length === 1 ? "attachment" : "attachments"}…`,
      });
      try {
        uploadedFiles = await Promise.all(
          files.map((file) => uploadFilePart(file)),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not upload attachment.";
        setUploadNotice({ tone: "error", message });
        setHistoryError(message);
        throw error;
      }
    }

    if (uploadedFiles.length > 0) {
      setUploadNotice({
        tone: "success",
        message: `Sent ${uploadedFiles.length === 1 ? "attachment" : "attachments"}: ${uploadedFiles
          .map((file) => file.filename)
          .join(", ")}`,
      });
    } else {
      setUploadNotice(null);
    }

    upsertPendingSession(
      text ? text : (uploadedFiles.at(0)?.filename ?? "Uploaded file"),
    );
    setInput("");
    const payload =
      uploadedFiles.length > 0
        ? { parts: createUploadMessageParts(text, uploadedFiles) }
        : { text };
    void sendMessage(payload)
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Could not send that message.";
        if (/file upload|unsupported file|upload/i.test(message)) {
          setUploadNotice({ tone: "error", message });
        }
        setHistoryError(message);
      })
      .finally(() => {
        void loadSessions({ quiet: true });
        focusPromptTextarea(promptInputRef.current);
      });
  }

  function resetToNewConversation(): void {
    const next = createConversationId();
    try {
      localStorage.setItem(conversationStorageKey, next);
    } catch {
      /* localStorage unavailable — the new session still works in memory */
    }
    setMessages([]);
    setInitialMessages([]);
    setConversationId(next);
    setInput("");
  }

  function startNewConversation(): void {
    setHistoryError(null);
    resetToNewConversation();
    closeDrawer();
    focusPromptTextarea(promptInputRef.current);
  }

  function openRenameDialog(session: WebChatSession): void {
    closeDrawer();
    setRenameDraft(session.title);
    setSessionDialog({ kind: "rename", session });
  }

  function openArchiveDialog(session: WebChatSession): void {
    closeDrawer();
    setSessionDialog({ kind: "archive", session });
  }

  function openDeleteDialog(session: WebChatSession): void {
    closeDrawer();
    setSessionDialog({ kind: "delete", session });
  }

  function closeSessionDialog(): void {
    setSessionDialog(null);
    setRenameDraft("");
  }

  async function renameConversation(
    session: WebChatSession,
    nextTitle: string,
  ): Promise<void> {
    const trimmedTitle = nextTitle.trim();
    if (
      isBusyStatus(status) ||
      renamingConversationId ||
      !trimmedTitle ||
      trimmedTitle === session.title
    ) {
      closeSessionDialog();
      return;
    }

    setHistoryError(null);
    setRenamingConversationId(session.id);
    try {
      const response = await fetch(
        `/api/chat/sessions?id=${encodeURIComponent(session.id)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        },
      );
      if (!response.ok) {
        throw new Error(
          describeFetchFailure(response, "Could not rename that session."),
        );
      }
      setSessions((current) =>
        current.map((candidate) =>
          candidate.id === session.id
            ? { ...candidate, title: trimmedTitle }
            : candidate,
        ),
      );
      closeSessionDialog();
      focusPromptTextarea(promptInputRef.current);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not rename that session.",
      );
    } finally {
      setRenamingConversationId(null);
    }
  }

  async function archiveConversation(session: WebChatSession): Promise<void> {
    if (isBusyStatus(status) || archivingConversationId) return;

    setHistoryError(null);
    setArchivingConversationId(session.id);
    try {
      const response = await fetch(
        `/api/chat/sessions/archive?id=${encodeURIComponent(session.id)}`,
        { method: "PUT", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          describeFetchFailure(response, "Could not archive that session."),
        );
      }
      setSessions((current) =>
        current.filter((candidate) => candidate.id !== session.id),
      );
      if (session.id === conversationId) {
        resetToNewConversation();
      }
      closeSessionDialog();
      focusPromptTextarea(promptInputRef.current);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not archive that session.",
      );
    } finally {
      setArchivingConversationId(null);
    }
  }

  async function deleteConversation(session: WebChatSession): Promise<void> {
    if (isBusyStatus(status) || deletingConversationId) return;

    setHistoryError(null);
    setDeletingConversationId(session.id);
    try {
      const response = await fetch(
        `/api/chat/sessions?id=${encodeURIComponent(session.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(
          describeFetchFailure(response, "Could not delete that session."),
        );
      }
      setSessions((current) =>
        current.filter((candidate) => candidate.id !== session.id),
      );
      if (session.id === conversationId) {
        resetToNewConversation();
      }
      closeSessionDialog();
      focusPromptTextarea(promptInputRef.current);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not delete that session.",
      );
    } finally {
      setDeletingConversationId(null);
    }
  }

  function renderSessions(): React.ReactNode {
    if (sessionsStatus === "loading" && sessions.length === 0) {
      return (
        <ul
          className="web-chat-sessions-list"
          aria-busy="true"
          aria-label="Loading sessions"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="web-chat-session-skeleton">
              <span />
              <div>
                <span />
                <span />
              </div>
            </li>
          ))}
        </ul>
      );
    }

    if (sessionError && sessions.length === 0) {
      return (
        <div className="web-chat-sessions-state" data-tone="error" role="alert">
          <span className="web-chat-sessions-state-tag">Signal lost</span>
          <p>{sessionError}</p>
          <button type="button" onClick={() => void loadSessions()}>
            Retry
          </button>
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="web-chat-sessions-state" aria-live="polite">
          <span className="web-chat-sessions-state-tag">No traces yet</span>
          <p>Your first thread will root here after you plant a question.</p>
        </div>
      );
    }

    return (
      <>
        {sessionError ? (
          <div className="web-chat-sessions-inline-error" role="status">
            <span>Sync paused</span>
            <button type="button" onClick={() => void loadSessions()}>
              Retry
            </button>
          </div>
        ) : null}
        <ul className="web-chat-sessions-list" role="listbox">
          {sessions.map((session) => {
            const isLoading = session.id === loadingConversationId;
            const isDeleting = session.id === deletingConversationId;
            const isArchiving = session.id === archivingConversationId;
            const isRenaming = session.id === renamingConversationId;
            const actionsDisabled =
              isBusyStatus(status) ||
              loadingConversationId !== null ||
              deletingConversationId !== null ||
              archivingConversationId !== null ||
              renamingConversationId !== null;
            return (
              <li key={session.id} className="web-chat-session-item">
                <button
                  className="web-chat-session"
                  type="button"
                  role="option"
                  aria-selected={session.id === conversationId}
                  aria-busy={
                    isLoading || isDeleting || isArchiving || isRenaming
                  }
                  disabled={actionsDisabled}
                  data-active={session.id === conversationId ? "true" : "false"}
                  data-loading={isLoading ? "true" : "false"}
                  onClick={() => void switchConversation(session.id)}
                >
                  <span className="web-chat-session-time">
                    {formatSessionTime(session.lastActiveAt)}
                  </span>
                  <div className="web-chat-session-body">
                    <h3 className="web-chat-session-title">{session.title}</h3>
                    {isLoading || isDeleting || isArchiving || isRenaming ? (
                      <span className="web-chat-session-subtitle">
                        {isRenaming
                          ? "renaming…"
                          : isArchiving
                            ? "archiving…"
                            : isDeleting
                              ? "deleting…"
                              : "reopening…"}
                      </span>
                    ) : null}
                  </div>
                </button>
                <button
                  className="web-chat-session-rename"
                  type="button"
                  aria-label={`Rename ${session.title}`}
                  disabled={actionsDisabled}
                  onClick={() => openRenameDialog(session)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M9.8 3.2 12.8 6.2" strokeLinecap="round" />
                    <path
                      d="M3.5 12.5 4.2 9.4 10.9 2.7a1.4 1.4 0 0 1 2 2L6.2 11.4l-2.7 1.1Z"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="web-chat-session-archive"
                  type="button"
                  aria-label={`Archive ${session.title}`}
                  disabled={actionsDisabled}
                  onClick={() => openArchiveDialog(session)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M3 5.2h10M4 5.2v7h8v-7" strokeLinejoin="round" />
                    <path d="M6.5 8h3" strokeLinecap="round" />
                    <path
                      d="M4.2 3.2h7.6L13 5.2H3l1.2-2Z"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="web-chat-session-delete"
                  type="button"
                  aria-label={`Delete ${session.title}`}
                  disabled={actionsDisabled}
                  onClick={() => openDeleteDialog(session)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M3.5 4.5h9" strokeLinecap="round" />
                    <path d="M6 4.5V3.2h4v1.3" strokeLinejoin="round" />
                    <path
                      d="M5 6.5v5.2M8 6.5v5.2M11 6.5v5.2M4.7 4.5l.45 8.3h5.7l.45-8.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

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

      {sessionDialog ? (
        <div className="web-chat-session-dialog-backdrop" role="presentation">
          <section
            className="web-chat-session-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="web-chat-session-dialog-title"
          >
            <span className="web-chat-session-dialog-kicker">
              {sessionDialog.kind === "rename"
                ? "Retitle trace"
                : sessionDialog.kind === "archive"
                  ? "Store trace"
                  : "Prune trace"}
            </span>
            <h2 id="web-chat-session-dialog-title">
              {sessionDialog.kind === "rename"
                ? "Rename this thread"
                : sessionDialog.kind === "archive"
                  ? "Archive this thread?"
                  : "Delete this thread?"}
            </h2>
            {sessionDialog.kind === "rename" ? (
              <form
                className="web-chat-session-dialog-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameConversation(sessionDialog.session, renameDraft);
                }}
              >
                <label htmlFor="web-chat-session-rename-input">
                  Trace title
                </label>
                <input
                  id="web-chat-session-rename-input"
                  value={renameDraft}
                  maxLength={sessionTitleMaxLength}
                  onInput={(event) => setRenameDraft(event.currentTarget.value)}
                />
                <div className="web-chat-session-dialog-actions">
                  <button type="button" onClick={closeSessionDialog}>
                    Keep old title
                  </button>
                  <button
                    type="submit"
                    data-primary="true"
                    disabled={
                      renamingConversationId !== null || !renameDraft.trim()
                    }
                  >
                    Rename
                  </button>
                </div>
              </form>
            ) : sessionDialog.kind === "archive" ? (
              <>
                <p>
                  This stores <strong>{sessionDialog.session.title}</strong> out
                  of the active rail without deleting its saved messages.
                </p>
                <div className="web-chat-session-dialog-actions">
                  <button type="button" onClick={closeSessionDialog}>
                    Keep active
                  </button>
                  <button
                    type="button"
                    data-primary="true"
                    disabled={archivingConversationId !== null}
                    onClick={() =>
                      void archiveConversation(sessionDialog.session)
                    }
                  >
                    Archive
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  This removes <strong>{sessionDialog.session.title}</strong>{" "}
                  and its saved messages from the session rail.
                </p>
                <div className="web-chat-session-dialog-actions">
                  <button type="button" onClick={closeSessionDialog}>
                    Keep trace
                  </button>
                  <button
                    type="button"
                    data-danger="true"
                    disabled={deletingConversationId !== null}
                    onClick={() =>
                      void deleteConversation(sessionDialog.session)
                    }
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      <aside className="web-chat-sessions" aria-label="Sessions">
        <header className="web-chat-sessions-header">
          <h2>Sessions</h2>
          <button
            className="web-chat-sessions-new"
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
        </header>

        {renderSessions()}

        <footer className="web-chat-sessions-footer">
          <span className="web-chat-sessions-footer-id">brain · anchor</span>
        </footer>
      </aside>

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
              Anchor
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
              Brain <em>Chat</em>
            </h1>
            <p>A field log for talking with the rhizome.</p>
          </div>
          <div className="web-chat-header-actions">
            <button
              className="web-chat-icon-action"
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              {theme === "light" ? (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path
                    d="M13 9.5A5 5 0 0 1 6.5 3a5 5 0 1 0 6.5 6.5Z"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="3" />
                  <path
                    d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
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
                  <MessageContent className="web-chat-message-bubble">
                    {groupMessageParts(message.parts).map((group, index) => {
                      if (group.kind === "text") {
                        return (
                          <MessageResponse key={index}>
                            {group.text}
                          </MessageResponse>
                        );
                      }
                      if (group.kind === "tools") {
                        if (group.tools.length === 1) {
                          return (
                            <ToolResultPart key={index} data={group.tools[0]} />
                          );
                        }
                        return (
                          <ToolCallsGroup key={index} tools={group.tools} />
                        );
                      }
                      if (group.kind === "confirmation") {
                        return (
                          <ConfirmationPart
                            key={index}
                            data={group.data}
                            addToolApprovalResponse={addToolApprovalResponse}
                          />
                        );
                      }
                      if (group.kind === "native-tool") {
                        return <NativeToolPart key={index} data={group.data} />;
                      }
                      if (group.kind === "attachment") {
                        return <AttachmentPart key={index} data={group.data} />;
                      }
                      if (group.kind === "progress") {
                        return <ProgressPart key={index} data={group.data} />;
                      }
                      if (group.kind === "file") {
                        return (
                          <UploadedFilePart
                            key={index}
                            filename={group.filename}
                            mediaType={group.mediaType}
                          />
                        );
                      }
                      return (
                        <GenericDataPart
                          key={index}
                          type={group.type}
                          data={group.data}
                        />
                      );
                    })}
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
              {statusPhrase(status)}
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
          <p className="web-chat-upload-notice" data-tone={uploadNotice.tone}>
            {uploadNotice.message}
          </p>
        ) : null}

        <PromptInput
          accept={uploadAccept}
          maxFileSize={uploadMaxFileSize}
          multiple
          onError={(uploadError) =>
            setUploadNotice({ tone: "error", message: uploadError.message })
          }
          onSubmit={(message) => submitMessage(message.text, message.files)}
        >
          <label htmlFor="web-chat-input">Message</label>
          <PromptInputHeader>
            <PromptAttachmentList />
          </PromptInputHeader>
          <PromptInputTextarea
            id="web-chat-input"
            ref={promptInputRef}
            value={input}
            placeholder="Plant a question…"
            onInput={(event) => setInput(event.currentTarget.value)}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptAttachmentButton />
            </PromptInputTools>
            <span className="web-chat-prompt-hint">
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd>{" "}
              newline
            </span>
            <PromptSubmitControl input={input} status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </main>
    </div>
  );
}
