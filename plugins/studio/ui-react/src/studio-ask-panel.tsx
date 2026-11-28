/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  Button,
  NativeSelect,
  useAppFetch,
  useFollowTail,
} from "@brains/app-ui-react";
import {
  createChatClient,
  type ChatHistoryMessage,
  type ChatUploadResponse,
} from "@brains/contracts/chat";
import {
  STUDIO_ENTRY_CONTEXT_SOURCE,
  studioEntryContextItemId,
} from "@brains/contracts/studio-entry-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type { AgentTarget } from "./api";
import {
  ASK_STARTERS,
  askPlaceholder,
  asksRewrite,
  peerPassage,
  type AskSelection,
} from "./ask-panel-model";
import type { Proposal, ProposalField } from "./chat-proposals";
import { askStyles as s } from "./studio-ask-panel.styles";
import { Composer } from "./studio-chat-composer";
import type { StudioChatDraftStore } from "./studio-chat-drafts";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { ChatTurn, type ChatTurnProposals } from "./studio-chat-thread";
import { useStudioApi } from "./studio-api-context";
import { errorMessage } from "./ui-utils";
import { useChatDraft } from "./use-chat-draft";
import { useChatStream } from "./use-chat-stream";
import { useChatThread } from "./use-chat-thread";

/** The upload a selected passage goes to this brain as. */
const SELECTION_FILENAME = "selection.md";

const isSelectionUpload = (upload: ChatUploadResponse): boolean =>
  upload.filename === SELECTION_FILENAME;

/** A question put to a connected brain, which answers outside Chat. */
interface PeerTurn {
  id: string;
  at: string;
  question: string;
  agent: AgentTarget;
  rewrite: boolean;
  selection: AskSelection | null;
  answer?: string;
  error?: string;
}

export interface StudioAskPanelProps {
  chatApiPath: string;
  draftStore: StudioChatDraftStore;
  entityType: string;
  entityId: string;
  title: string;
  typeLabel: string;
  /** The saved body, which this brain and a connected one both read. */
  savedBody: string;
  /** The draft differs from the saved entry, which is what Ask reads. */
  unsaved: boolean;
  /** The passage selected in the body, which the panel is then about. */
  selection: AskSelection | null;
  onClearSelection: () => void;
  /** The fields an answer may propose text for. */
  fields: readonly ProposalField[];
  /** Brains this one is connected to, which can be asked directly. */
  agents: readonly AgentTarget[];
  /**
   * Put a proposal in the open draft; the selection is the one it was asked
   * about. Answers why it could not, or null when it did.
   */
  onApply: (
    proposal: Proposal,
    selection: AskSelection | null,
  ) => string | null;
  onClose: () => void;
}

/**
 * Ask, docked beside the editor. Asking this brain is the entry's own Chat
 * conversation, which full-page Chat shows too; a connected brain is asked
 * directly, as the rewrite bar did. A proposal goes into the draft, never
 * straight into the stored entry.
 */
export function StudioAskPanel(props: StudioAskPanelProps): ReactElement {
  const queryClient = useQueryClient();
  const appFetch = useAppFetch();
  const api = useStudioApi();
  const chatClient = useMemo(
    () => createChatClient({ apiPath: props.chatApiPath, fetch: appFetch }),
    [props.chatApiPath, appFetch],
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [opening, setOpening] = useState<"opening" | "open" | "failed">(
    "opening",
  );
  const [attempt, setAttempt] = useState(0);
  const [whoId, setWhoId] = useState<string>("");
  const [peerTurns, setPeerTurns] = useState<PeerTurn[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // The selection being uploaded; sending waits until it is attached.
  const [uploadingText, setUploadingText] = useState<string | null>(null);
  const uploading = uploadingText !== null;
  const mountedRef = useRef(false);
  const adoptedSessionRef = useRef<string | null>(null);
  const attachedRef = useRef<{ text: string; upload: ChatUploadResponse }>(
    null,
  );
  const askedSelectionRef = useRef<AskSelection | null>(null);
  const who = props.agents.find((agent) => agent.id === whoId) ?? null;

  // The conversation about this entry: one per person and entry, kept.
  useEffect(() => {
    let current = true;
    setOpening("opening");
    chatClient
      .openContextSession({
        version: 1,
        sourceId: STUDIO_ENTRY_CONTEXT_SOURCE,
        itemId: studioEntryContextItemId(props.entityType, props.entityId),
        titleSeed: (props.title.trim() || props.typeLabel).slice(0, 160),
      })
      .then(({ conversationId }) => {
        if (!current) return;
        setSessionId(conversationId);
        setOpening("open");
      })
      .catch(() => {
        if (current) setOpening("failed");
      });
    return (): void => {
      current = false;
    };
    // The title seeds a new conversation only; renaming must not reopen it.
  }, [chatClient, props.entityType, props.entityId, attempt]);

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
    apiPath: props.chatApiPath,
    sessionId,
  });
  const {
    pendingMessages,
    stream,
    sending,
    error,
    submitPrompt,
    respondToApproval,
    runSuggestedAction,
    hasActiveStream,
    stopActiveStream,
    abortActiveStream,
  } = useChatStream({
    chatClient,
    queryClient,
    sessionId,
    apiPath: props.chatApiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    adoptedSessionRef,
    uploads,
    uploading,
    uploadAttemptCount: 0,
    navigateToSession: (conversationId) => {
      if (conversationId) setSessionId(conversationId);
    },
  });
  const { visibleMessages, historyFailed, retryHistory } = useChatThread({
    chatClient,
    sessionId,
    sending,
    pendingMessages,
    stream,
  });

  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
      abortActiveStream();
    };
  }, [abortActiveStream]);

  // The selection goes to this brain as a file beside the question, and stays
  // attached for as long as the panel is about it.
  const selectionText = props.selection?.text ?? null;
  const selectionAttached = uploads.some(isSelectionUpload);
  const latestSelectionRef = useRef(selectionText);
  latestSelectionRef.current = selectionText;
  useEffect(() => {
    // Uploads belong to the conversation's draft, so wait until it is open.
    if (!sessionId) return;
    if (!selectionText) {
      if (selectionAttached)
        setUploads((current) => current.filter((u) => !isSelectionUpload(u)));
      return;
    }
    const attached = attachedRef.current;
    if (attached?.text === selectionText) {
      if (!selectionAttached)
        setUploads((current) => [...current, attached.upload]);
      return;
    }
    if (uploadingText === selectionText) return;
    setUploadingText(selectionText);
    chatClient
      .upload(
        new Blob([selectionText], { type: "text/markdown" }),
        SELECTION_FILENAME,
      )
      .then((upload) => {
        attachedRef.current = { text: selectionText, upload };
        // A newer selection replaces this one when its own upload lands.
        if (!mountedRef.current || latestSelectionRef.current !== selectionText)
          return;
        setUploads((existing) => [
          ...existing.filter((u) => !isSelectionUpload(u)),
          upload,
        ]);
      })
      .catch(() => {
        if (mountedRef.current)
          setNotice("The selection could not be attached.");
      })
      .finally(() => {
        if (mountedRef.current)
          setUploadingText((current) =>
            current === selectionText ? null : current,
          );
      });
  }, [
    chatClient,
    sessionId,
    selectionText,
    selectionAttached,
    uploadingText,
    setUploads,
  ]);

  const askPeer = useCallback(
    (agent: AgentTarget, question: string): void => {
      const selection = props.selection;
      const passage = peerPassage(props.savedBody, selection);
      if (!passage.trim()) {
        setNotice(
          `There is nothing in this ${props.typeLabel} to ask about yet.`,
        );
        return;
      }
      const turn: PeerTurn = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        question,
        agent,
        rewrite: asksRewrite(question) && selection !== null,
        selection,
      };
      setPeerTurns((current) => [...current, turn]);
      setDraft("");
      api
        .requestAgentAnswer({
          entityType: props.entityType,
          id: props.entityId,
          agent: agent.id,
          instruction: question,
          selection: passage,
        })
        .then(({ response }) =>
          setPeerTurns((current) =>
            current.map((t) =>
              t.id === turn.id ? { ...t, answer: response } : t,
            ),
          ),
        )
        .catch((failure: unknown) => {
          // A connected brain reads the saved entry, as this one does.
          const message = errorMessage(failure);
          const error = /no longer matches/i.test(message)
            ? "the selection is not saved yet. Save, then ask again."
            : message;
          setPeerTurns((current) =>
            current.map((t) => (t.id === turn.id ? { ...t, error } : t)),
          );
        });
    },
    [
      api,
      props.savedBody,
      props.entityId,
      props.entityType,
      props.selection,
      props.typeLabel,
      setDraft,
    ],
  );

  const ask = useCallback(
    (question: string): void => {
      const text = question.trim();
      if (!text) return;
      setNotice(null);
      askedSelectionRef.current = props.selection;
      if (who) {
        askPeer(who, text);
        return;
      }
      void submitPrompt(text);
    },
    [askPeer, props.selection, submitPrompt, who],
  );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    ask(draft);
  };

  const apply = (proposal: Proposal, selection: AskSelection | null): void => {
    const refusal = props.onApply(proposal, selection);
    setNotice(
      refusal ??
        (proposal.field === "selection"
          ? "Replaced in the draft. Save to keep it."
          : `Put in the draft’s ${proposal.label.toLowerCase()}. Save to keep it.`),
    );
  };

  const proposalsFor = (selection: AskSelection | null): ChatTurnProposals => ({
    fields: props.fields,
    onApply: (proposal: Proposal): void => apply(proposal, selection),
    onTryAnother: (proposal: Proposal): void =>
      ask(`Try another ${proposal.label.toLowerCase()}.`),
  });

  // Chat's turns and the connected brains' answers, in the order they came.
  const turns = [
    ...visibleMessages.map((message) => ({
      at: typeof message["timestamp"] === "string" ? message["timestamp"] : "",
      key: message.id,
      node: (
        <ChatTurn
          key={message.id}
          message={message}
          client={chatClient}
          disabled={sending}
          speaker="Your brain"
          onAction={runSuggestedAction}
          onApproval={respondToApproval}
          proposals={proposalsFor(askedSelectionRef.current)}
        />
      ),
    })),
    ...peerTurns.map((turn) => ({
      at: turn.at,
      key: turn.id,
      node: (
        <PeerExchange
          key={turn.id}
          turn={turn}
          client={chatClient}
          proposals={proposalsFor(turn.selection)}
          onRetry={() => askPeer(turn.agent, turn.question)}
        />
      ),
    })),
  ].sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : 0));

  // The newest answer stays in view as it arrives, unless the reader scrolled up.
  const { ref: threadRef, onScroll: onThreadScroll } = useFollowTail({
    resetKey: sessionId,
    contentKey: `${turns.length}:${stream?.text.length ?? -1}:${peerTurns.filter((t) => t.answer !== undefined || t.error !== undefined).length}:${notice ?? ""}`,
  });

  const about = props.selection
    ? "About the selection"
    : `About this ${props.typeLabel}`;
  return (
    <aside {...stylex.props(s.panel)} aria-label="Ask" data-studio-ask-panel="">
      <header {...stylex.props(s.head)}>
        <h2 {...stylex.props(s.title)}>Ask</h2>
        <span {...stylex.props(s.about)} data-studio-ask-about="">
          {about}
          {props.selection && (
            <button
              type="button"
              {...stylex.props(s.clear)}
              aria-label={`Ask about the whole ${props.typeLabel}`}
              onClick={props.onClearSelection}
            >
              ×
            </button>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          xstyle={s.close}
          aria-label="Close Ask"
          aria-keyshortcuts="Control+j Meta+j"
          onClick={props.onClose}
        >
          ×
        </Button>
      </header>
      {props.agents.length > 0 && (
        <div {...stylex.props(s.who)}>
          <label htmlFor="studio-ask-who">Asking</label>
          <NativeSelect
            id="studio-ask-who"
            xstyle={s.whoSelect}
            value={whoId}
            onChange={(event) => setWhoId(event.currentTarget.value)}
          >
            <option value="">Your brain</option>
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div
        ref={threadRef}
        onScroll={onThreadScroll}
        {...stylex.props(s.thread)}
        role="log"
        aria-label="Ask conversation"
        aria-live="polite"
      >
        {opening === "failed" ? (
          <p {...stylex.props(s.notice)}>
            Chat could not open a conversation about this {props.typeLabel}.{" "}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
          </p>
        ) : historyFailed ? (
          <p {...stylex.props(s.notice)}>
            The conversation could not be read.{" "}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={retryHistory}
            >
              Try again
            </Button>
          </p>
        ) : turns.length === 0 ? (
          <p {...stylex.props(s.notice)}>
            {props.selection
              ? "Ask about the selected passage, or have it rewritten."
              : `Ask about this ${props.typeLabel}. Select a passage to ask about it alone.`}
          </p>
        ) : (
          turns.map((turn) => turn.node)
        )}
        {props.unsaved && turns.length > 0 && (
          <p {...stylex.props(s.notice)}>
            Ask reads the saved version of this {props.typeLabel}.
          </p>
        )}
        {(error ?? notice) && (
          <p {...stylex.props(s.notice)} role="status">
            {error ?? notice}
          </p>
        )}
      </div>
      {props.selection && (
        <div {...stylex.props(s.starters)} aria-label="Starters">
          {ASK_STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              {...stylex.props(s.starter)}
              onClick={() => setDraft(starter.instruction)}
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}
      <Composer
        draft={draft}
        sending={sending}
        uploading={uploading}
        uploads={uploads.filter((upload) => !isSelectionUpload(upload))}
        uploadAttempts={[]}
        onRetryUpload={() => {}}
        onDismissUpload={() => {}}
        onDraft={setDraft}
        locked={opening !== "open"}
        onRemoveUpload={(id) =>
          setUploads((current) => current.filter((upload) => upload.id !== id))
        }
        onFiles={async () => {}}
        allowFiles={false}
        onSubmit={submit}
        onStop={hasActiveStream() ? stopActiveStream : undefined}
        placeholder={askPlaceholder({
          who: who?.label ?? null,
          selected: props.selection !== null,
          typeLabel: props.typeLabel,
        })}
      />
    </aside>
  );
}

/** A question to a connected brain and its answer, as Chat turns show them. */
function PeerExchange(props: {
  turn: PeerTurn;
  client: ReturnType<typeof createChatClient>;
  proposals: ChatTurnProposals;
  onRetry: () => void;
}): ReactElement {
  const { turn } = props;
  const question: ChatHistoryMessage = {
    id: `${turn.id}-question`,
    role: "user",
    content: turn.question,
    timestamp: turn.at,
  };
  // A rewrite of the selection is a proposal to replace it.
  const content =
    turn.answer === undefined
      ? ""
      : turn.rewrite
        ? `\`\`\`proposal selection\n${turn.answer.trim()}\n\`\`\``
        : turn.answer;
  const answer: ChatHistoryMessage = {
    id: `${turn.id}-answer`,
    role: "assistant",
    content,
    timestamp: turn.at,
  };
  const noAction = async (): Promise<void> => {};
  return (
    <>
      <ChatTurn
        message={question}
        client={props.client}
        disabled={false}
        onAction={noAction}
        onApproval={noAction}
      />
      {turn.error ? (
        <p className={chatClass("", chatLayout.error)} role="alert">
          {turn.agent.label} did not answer: {turn.error}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={props.onRetry}
          >
            Ask again
          </Button>
        </p>
      ) : turn.answer === undefined ? (
        <p className={chatClass("", chatLayout.empty)}>
          Asking {turn.agent.label}…
        </p>
      ) : (
        <ChatTurn
          message={answer}
          client={props.client}
          disabled={false}
          speaker={turn.agent.label}
          onAction={noAction}
          onApproval={noAction}
          proposals={turn.rewrite ? props.proposals : undefined}
        />
      )}
    </>
  );
}
