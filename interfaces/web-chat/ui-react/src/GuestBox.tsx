/** @jsxImportSource react */
import { useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useFollowTail } from "@brains/app-ui-react";
import type {
  ChatHistoryMessage,
  GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { GuestTranscript } from "./GuestTranscript";
import { GuestBoxComposer } from "./GuestBoxComposer";
import { GuestBoxFreshConfirmation, GuestBoxNotice } from "./GuestBoxNotice";
import { GuestBoxPending } from "./GuestBoxPending";
import { GuestBoxWelcome } from "./GuestBoxWelcome";
import type { GuestBoxCopy, GuestBoxState } from "./guest-box-types";
import { useAnswerAnchoring } from "./use-answer-anchoring";
import { useAskHost } from "./use-ask-host";
import { useGuestBoxViewport } from "./use-guest-box-viewport";
import { useAskSheet } from "./use-ask-sheet";
import { useInitialIntent } from "./use-initial-intent";
import { useStopWaitingOffer } from "./use-stop-waiting-offer";
import { ASK_DOCK_ATTRIBUTE } from "@brains/contracts";

export interface GuestBoxProps {
  copy: GuestBoxCopy;
  submitOnReady?: boolean;
  session: GuestChatSessionResponse | undefined;
  state: GuestBoxState;
  busy: boolean;
  messages: ChatHistoryMessage[];
  earlier: ChatHistoryMessage[];
  draft: string;
  setDraft: (value: string) => void;
  canSend: boolean;
  canCheck: boolean;
  canContinue: boolean;
  onSend: () => void;
  onCheck: () => Promise<void>;
  onAvailability: () => Promise<void>;
  onFresh: () => Promise<boolean>;
  onContinue: () => void;
  onStopWaiting: () => void;
  actionNotice: string | undefined;
  /** How long an answer may take before the box offers to stop waiting. */
  stopWaitingAfterMs?: number;
}

function activityText(busy: boolean, state: GuestBoxState): string {
  if (!busy) return "";
  if (state === "sending") return "Sending your question…";
  if (state === "working") return "Working on your question…";
  return "Connecting to chat…";
}

/** Presentation only. Admission, ownership, history and transport stay in GuestApp. */
export function GuestBox(props: GuestBoxProps): ReactElement {
  const { copy, state, messages, earlier, draft, busy, session } = props;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const freshButton = useRef<HTMLButtonElement>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  // A fresh token whenever anything that changes the region's height does.
  const contentKey = useMemo(
    () => ({}),
    [messages, earlier, state, busy, confirmFresh, props.actionNotice],
  );
  const tail = useFollowTail({ resetKey: null, contentKey });
  // An answer is being written; after a while the visitor may stop waiting.
  const waiting = busy && (state === "sending" || state === "working");
  const offerStop = useStopWaitingOffer(waiting, props.stopWaitingAfterMs);
  useGuestBoxViewport(root, input);
  const sheet = useAskSheet(root, input);
  // Closed on a phone, the box is a composer and a way back to the conversation.
  const compact = sheet.narrow && !sheet.open;
  const { owner, placeholder, header } = useAskHost(root);
  useInitialIntent(input, {
    submitOnReady: props.submitOnReady === true,
    busy,
    canSend: props.canSend,
    onSend: props.onSend,
    compact,
  });
  useAnswerAnchoring(tail, messages);

  const maximum = session?.messageCharacters ?? 4000;
  const over = draft.length - maximum;
  const welcome =
    messages.length === 0 &&
    earlier.length === 0 &&
    (state === "ready" || state === "connecting");

  function submit(): void {
    if (!props.canSend || busy || over > 0 || !draft.trim()) return;
    tail.follow();
    props.onSend();
    // Full screen, the keyboard closes so the answer gets the screen back.
    if (sheet.open) input.current?.blur();
    else input.current?.focus({ preventScroll: true });
  }

  const actions = props.canContinue && !sheet.open && (
    <div className="brain-box-header-actions">
      <a href="/ask" onClick={props.onContinue}>
        Full chat ↗
      </a>
    </div>
  );

  const placeActions = (): ReactElement | null => {
    if (sheet.open)
      return (
        <div className="brain-box-sheet-head">
          {/* Full screen, there is no title row: the conversation starts at
              the top, the title is for screen readers, and the way out sits
              over the corner. The note under the composer says the rest. */}
          <span className="brain-box-sheet-title brain-box-sr-only">
            {owner ? `Ask ${owner}` : "Conversation"}
          </span>
          <button
            className="brain-box-close"
            type="button"
            aria-label="Close conversation"
            onClick={sheet.close}
          >
            ✕
          </button>
        </div>
      );
    if (!actions) return null;
    return header ? createPortal(actions, header) : actions;
  };

  return (
    <div
      className={`brain-guest-box${sheet.open ? " is-sheet" : ""}${compact ? " is-compact" : ""}`}
      ref={root}
    >
      {placeActions()}
      <div
        ref={tail.ref}
        className={`brain-box-scroll${welcome ? " is-welcome" : ""}`}
        role="region"
        aria-label="Conversation and chat information"
        tabIndex={0}
        onScroll={tail.onScroll}
      >
        {/* A host may lend what it docks at the top of the conversation here;
            it is theirs, and React never renders into it. */}
        <div className="brain-box-dock" {...{ [ASK_DOCK_ATTRIBUTE]: "" }} />
        <GuestBoxWelcome
          copy={copy}
          welcome={welcome}
          onTopic={(topic): void => {
            props.setDraft(topic);
            input.current?.focus();
          }}
        />
        {earlier.length > 0 && (
          <details className="brain-box-earlier">
            <summary>Earlier text · not resent</summary>
            <GuestTranscript messages={earlier} />
          </details>
        )}
        <GuestTranscript
          messages={messages}
          sourceLinks
          {...(owner ? { assistantLabel: owner } : {})}
        />
        {waiting && messages.at(-1)?.role === "user" && (
          <GuestBoxPending owner={owner} />
        )}
        <p
          className={`brain-box-activity${waiting || (busy && state === "connecting") ? " brain-box-sr-only" : ""}${state === "complete" && !busy ? " is-complete" : ""}`}
          role="status"
          aria-live="polite"
        >
          {activityText(busy, state)}
        </p>
        <GuestBoxNotice
          state={state}
          busy={busy}
          canCheck={props.canCheck}
          freshButtonRef={freshButton}
          onCheck={(): void => {
            void props.onCheck();
          }}
          onAvailability={(): void => {
            void props.onAvailability();
          }}
          onFresh={(): void => setConfirmFresh(true)}
        />
        {offerStop && (
          <button
            className="brain-box-quiet"
            type="button"
            onClick={props.onStopWaiting}
          >
            Stop waiting
          </button>
        )}
        {confirmFresh && (
          <GuestBoxFreshConfirmation
            busy={busy}
            regionRef={tail.ref}
            onContinue={(): void => {
              void props.onFresh().then((started) => {
                if (started) {
                  setConfirmFresh(false);
                  input.current?.focus();
                }
              });
            }}
            onBack={(): void => {
              setConfirmFresh(false);
              freshButton.current?.focus();
            }}
          />
        )}
        {props.actionNotice && (
          <p className="brain-box-notice" role="status">
            {props.actionNotice}
          </p>
        )}
      </div>
      <div className="brain-box-bottom">
        {compact && messages.length > 0 && (
          <button
            className="brain-box-resume"
            type="button"
            onClick={sheet.show}
          >
            <span className="brain-box-resume-dot" aria-hidden="true" />
            Continue conversation
          </button>
        )}
        <GuestBoxComposer
          copy={placeholder ? { ...copy, inputHint: placeholder } : copy}
          inputRef={input}
          onFocus={sheet.show}
          onLand={sheet.land}
          draft={draft}
          setDraft={props.setDraft}
          over={over}
          welcome={welcome}
          busy={busy}
          canSend={props.canSend}
          onSubmit={submit}
        />
        {/* The rest of a long answer is offered where the note was, never
            over the text; the note comes back at the end. */}
        {tail.awayFromLatest && !compact && (
          <button
            className="brain-box-latest"
            type="button"
            onClick={tail.jumpToLatest}
          >
            ↓ Rest of the answer
          </button>
        )}
      </div>
    </div>
  );
}
