/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { useFollowTail } from "@brains/app-ui-react";
import type {
  ChatHistoryMessage,
  GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { GuestMarkdown, GuestTranscript } from "./GuestTranscript";
import { GuestBoxAbout } from "./GuestBoxAbout";
import { GuestBoxComposer } from "./GuestBoxComposer";
import { GuestBoxFreshConfirmation, GuestBoxNotice } from "./GuestBoxNotice";
import type { GuestBoxCopy, GuestBoxState } from "./guest-box-types";
import { useGuestBoxViewport } from "./use-guest-box-viewport";
import { useAskSheet } from "./use-ask-sheet";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_DOCK_ATTRIBUTE,
  ASK_NAME_ATTRIBUTE,
} from "@brains/contracts";

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

const STOP_WAITING_AFTER_MS = 20_000;

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
  const aboutButton = useRef<HTMLButtonElement>(null);
  const lastAboutTop = useRef(0);
  const [header, setHeader] = useState<Element | null>(null);
  const [about, setAbout] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  // A fresh token whenever anything that changes the region's height does.
  const contentKey = useMemo(
    () => ({}),
    [messages, earlier, state, busy, confirmFresh, props.actionNotice],
  );
  const tail = useFollowTail({ resetKey: null, contentKey, paused: about });
  // An answer is being written; after a while the visitor may stop waiting.
  const waiting = busy && (state === "sending" || state === "working");
  const [patient, setPatient] = useState(false);
  const stopWaitingAfterMs = props.stopWaitingAfterMs ?? STOP_WAITING_AFTER_MS;
  useEffect(() => {
    setPatient(false);
    if (!waiting) return;
    const timer = window.setTimeout(() => setPatient(true), stopWaitingAfterMs);
    return (): void => window.clearTimeout(timer);
  }, [waiting, stopWaitingAfterMs]);
  useGuestBoxViewport(root, input);
  const sheet = useAskSheet(root, input);
  // Closed on a phone, the box is a composer and a way back to the conversation.
  const compact = sheet.narrow && !sheet.open;
  // Whose brain this is, from the host (ASK_NAME_ATTRIBUTE), once mounted.
  const [owner, setOwner] = useState<string>();
  useEffect(() => {
    setOwner(
      root.current
        ?.closest(`[${ASK_BOX_ATTRIBUTE}]`)
        ?.getAttribute(ASK_NAME_ATTRIBUTE)
        ?.trim() ?? undefined,
    );
  }, []);

  const initialIntent = useRef(props.submitOnReady === true);
  const initialFocus = useRef(true);
  useEffect(() => {
    if (props.busy) return;
    if (initialFocus.current) {
      initialFocus.current = false;
      // Only while the conversation is in view: focusing a closed sheet's
      // composer would open it again after the visitor closed it.
      if (document.activeElement === document.body && !compact)
        input.current?.focus({ preventScroll: true });
    }
    if (!initialIntent.current) return;
    initialIntent.current = false;
    if (props.canSend) props.onSend();
  }, [props.busy, props.canSend, props.onSend]);

  useEffect(() => {
    setHeader(root.current?.closest(".talk")?.querySelector(".ui-bar") ?? null);
  }, []);

  // An answer opens at its question, so it is read from the start; the reader
  // follows the end again from "Latest". A box its page grows has no region
  // to scroll and is left to the page.
  const lastRole = useRef(messages.at(-1)?.role);
  useLayoutEffect(() => {
    const previous = lastRole.current;
    lastRole.current = messages.at(-1)?.role;
    if (previous !== "user" || messages.at(-1)?.role !== "assistant") return;
    const region = tail.ref.current;
    if (!region || region.scrollHeight <= region.clientHeight) return;
    const asked = [...region.querySelectorAll<HTMLElement>(".guest-user")].at(
      -1,
    );
    if (asked) tail.showFrom(asked);
  }, [messages]);

  // The confirmation opens at the end of the region, where it was asked for.
  useLayoutEffect(() => {
    const region = tail.ref.current;
    if (confirmFresh && region) region.scrollTop = region.scrollHeight;
  }, [confirmFresh]);

  // About takes the top of the region; closing it returns the reader to
  // where they were.
  useLayoutEffect(() => {
    const region = tail.ref.current;
    if (region) region.scrollTop = about ? 0 : lastAboutTop.current;
  }, [about]);

  const maximum = session?.messageCharacters ?? 4000;
  const over = draft.length - maximum;
  const welcome =
    messages.length === 0 &&
    earlier.length === 0 &&
    (state === "ready" || state === "connecting");

  function toggleAbout(): void {
    if (!about) lastAboutTop.current = tail.ref.current?.scrollTop ?? 0;
    setAbout(!about);
  }

  function submit(): void {
    if (!props.canSend || busy || over > 0 || !draft.trim()) return;
    tail.follow();
    props.onSend();
    // Full screen, the keyboard closes so the answer gets the screen back.
    if (sheet.open) input.current?.blur();
    else input.current?.focus({ preventScroll: true });
  }

  const actions = (
    <div className="brain-box-header-actions">
      {props.canContinue && !sheet.open && (
        <a href="/ask" onClick={props.onContinue}>
          Full chat ↗
        </a>
      )}
      <button
        ref={aboutButton}
        type="button"
        aria-expanded={about}
        onClick={toggleAbout}
      >
        About
      </button>
    </div>
  );

  const placeActions = (): ReactElement | null => {
    if (sheet.open)
      return (
        <div className="brain-box-sheet-head">
          <span className="brain-box-sheet-title">
            {owner ? `Ask ${owner}` : "Conversation"}
          </span>
          {actions}
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
        className={`brain-box-scroll${welcome && !about ? " is-welcome" : ""}`}
        role="region"
        aria-label="Conversation and chat information"
        tabIndex={0}
        onScroll={tail.onScroll}
      >
        {/* A host may lend what it docks at the top of the conversation here;
            it is theirs, and React never renders into it. */}
        <div className="brain-box-dock" {...{ [ASK_DOCK_ATTRIBUTE]: "" }} />
        {about && (
          <GuestBoxAbout
            session={session}
            onClose={(): void => {
              toggleAbout();
              aboutButton.current?.focus({ preventScroll: true });
            }}
          />
        )}
        {welcome && (copy.title || copy.notice || copy.topics.length > 0) && (
          <div className="brain-box-welcome">
            {copy.title && (
              <h2 id="brain-chat-heading" className="display">
                {copy.title}
              </h2>
            )}
            {copy.notice && (
              <div className="chat-notice">
                <GuestMarkdown>{copy.notice}</GuestMarkdown>
              </div>
            )}
            <div className="hints" aria-label={copy.topicsLabel}>
              {copy.topics.map((topic, index) => (
                <button
                  type="button"
                  key={`${index}:${topic}`}
                  onClick={(): void => {
                    props.setDraft(topic);
                    input.current?.focus();
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        )}
        {(!welcome || !copy.title) && (
          <h2 id="brain-chat-heading" className="brain-box-sr-only">
            {copy.title || "Ask"}
          </h2>
        )}
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
          <section
            className="guest-message guest-assistant brain-box-pending"
            aria-hidden="true"
          >
            <h2>{owner ?? "Brain"}</h2>
            <p className="brain-box-waiting">
              <span className="brain-box-dots">
                <i />
                <i />
                <i />
              </span>
              {owner
                ? `Looking through ${owner}'s work`
                : "Looking through the brain's work"}
            </p>
          </section>
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
        {waiting && patient && (
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
        {tail.awayFromLatest && !about && !compact && (
          <button
            className="brain-box-latest"
            type="button"
            aria-label="Latest"
            onClick={tail.jumpToLatest}
          >
            ↓
          </button>
        )}
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
          copy={copy}
          inputRef={input}
          onFocus={sheet.show}
          {...(owner
            ? { answeredNote: `Answers come from what ${owner} has published.` }
            : {})}
          draft={draft}
          setDraft={props.setDraft}
          over={over}
          welcome={welcome}
          busy={busy}
          canSend={props.canSend}
          hasMessages={messages.length > 0}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}
