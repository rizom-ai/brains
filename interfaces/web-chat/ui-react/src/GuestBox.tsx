/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type {
  ChatHistoryMessage,
  GuestChatSessionResponse,
} from "@brains/contracts/chat";
import type { GuestBoxCopy } from "./GuestApp";
import { GuestTranscript } from "./GuestTranscript";

export type GuestBoxState =
  | "connecting"
  | "ready"
  | "sending"
  | "working"
  | "complete"
  | "incomplete"
  | "uncertain"
  | "limit"
  | "unavailable"
  | "expired"
  | "history-unavailable"
  | "ended";

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
}

/** Presentation only. Admission, ownership, history and transport stay in GuestApp. */
export function GuestBox(props: GuestBoxProps): ReactElement {
  const { copy, state, messages, earlier, draft, busy, session } = props;
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const confirmation = useRef<HTMLButtonElement>(null);
  const freshButton = useRef<HTMLButtonElement>(null);
  const aboutButton = useRef<HTMLButtonElement>(null);
  const aboutClose = useRef<HTMLButtonElement>(null);
  const following = useRef(true);
  const forceTail = useRef(false);
  const lastAboutTop = useRef(0);
  const [header, setHeader] = useState<Element | null>(null);
  const [about, setAbout] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [latest, setLatest] = useState(false);
  const initialIntent = useRef(props.submitOnReady === true);
  const initialFocus = useRef(true);
  useEffect(() => {
    if (props.busy) return;
    if (initialFocus.current) {
      initialFocus.current = false;
      if (document.activeElement === document.body)
        input.current?.focus({ preventScroll: true });
    }
    if (!initialIntent.current) return;
    initialIntent.current = false;
    if (props.canSend) props.onSend();
  }, [props.busy, props.canSend, props.onSend]);
  const maximum = session?.messageCharacters ?? 4000;
  const over = draft.length - maximum;
  const welcome =
    messages.length === 0 &&
    earlier.length === 0 &&
    (state === "ready" || state === "connecting");

  function measureScroll(): void {
    const region = scroll.current;
    if (!region) return;
    following.current =
      region.scrollHeight - region.clientHeight - region.scrollTop < 24;
    setLatest(!following.current && !about);
  }

  useEffect(() => {
    setHeader(root.current?.closest(".talk")?.querySelector(".ui-bar") ?? null);
    const viewport = window.visualViewport;
    const resize = (): void => {
      root.current
        ?.closest<HTMLElement>(".talk")
        ?.style.setProperty(
          "--chat-viewport-height",
          `${viewport?.height ?? window.innerHeight}px`,
        );
      if (document.activeElement === input.current && window.innerWidth <= 650)
        root.current?.scrollIntoView({ block: "end" });
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return (): void => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useLayoutEffect(() => {
    const composer = input.current;
    if (composer) {
      composer.style.height = "40px";
      composer.style.height = `${Math.min(composer.scrollHeight || 40, window.innerWidth <= 650 ? 72 : 112)}px`;
    }
    const region = scroll.current;
    if (region && !about && (following.current || forceTail.current)) {
      region.scrollTop = region.scrollHeight;
      forceTail.current = false;
    }
    measureScroll();
  }, [messages, earlier, draft, state, about]);

  useLayoutEffect(() => {
    if (!confirmFresh) return;
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    confirmation.current?.focus({ preventScroll: true });
  }, [confirmFresh]);

  function toggleAbout(): void {
    if (!about) lastAboutTop.current = scroll.current?.scrollTop ?? 0;
    setAbout(!about);
  }
  useLayoutEffect(() => {
    const region = scroll.current;
    if (about) {
      if (region) region.scrollTop = 0;
      aboutClose.current?.focus({ preventScroll: true });
    } else if (region) {
      region.scrollTop = lastAboutTop.current;
      measureScroll();
    }
  }, [about]);

  function submit(): void {
    if (!props.canSend || busy || over > 0 || !draft.trim()) return;
    forceTail.current = true;
    following.current = true;
    props.onSend();
    input.current?.focus({ preventScroll: true });
  }
  const newQuestion = (): ReactElement => (
    <button
      ref={freshButton}
      type="button"
      className="brain-box-action"
      disabled={busy}
      onClick={(): void => setConfirmFresh(true)}
    >
      New question
    </button>
  );
  let notice: ReactElement | undefined;
  if (state === "incomplete")
    notice = (
      <>
        <h3>The connection dropped.</h3>
        <p>
          Your answer may still be finishing. Checking won’t repeat your
          question.
        </p>
      </>
    );
  if (state === "uncertain")
    notice = (
      <>
        <h3>Connection lost.</h3>
        <p>
          We can’t confirm whether your question was received. It’s still here,
          and we won’t send it again.
        </p>
      </>
    );
  if (state === "limit")
    notice = (
      <>
        <h3>No more questions can be sent right now.</h3>
        <p>
          A chat limit was reached, or another question is still running. Your
          visible text stays here.
        </p>
      </>
    );
  if (state === "unavailable")
    notice = (
      <>
        <h3>Chat isn’t available right now.</h3>
        <p>
          You can keep writing. Checking availability won’t send your question.
        </p>
      </>
    );
  if (state === "expired" || state === "history-unavailable")
    notice = (
      <>
        <h3>This conversation is unavailable.</h3>
        <p>
          You can still read what’s visible here. Starting separately won’t
          restore or repeat the previous question.
        </p>
      </>
    );
  if (state === "ended")
    notice = (
      <>
        <h3>The previous request ended without a complete answer.</h3>
        <p>Your visible text is preserved. You can write a new question.</p>
      </>
    );

  const actions = (
    <div className="brain-box-header-actions">
      {props.canContinue && (
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
  const activity = busy
    ? state === "sending"
      ? "Sending your question…"
      : state === "working"
        ? "Working on your question…"
        : "Connecting to chat…"
    : "";

  return (
    <div className="brain-guest-box" ref={root}>
      {header ? createPortal(actions, header) : actions}
      <div
        ref={scroll}
        className={`brain-box-scroll${welcome && !about ? " is-welcome" : ""}`}
        role="region"
        aria-label="Conversation and chat information"
        tabIndex={0}
        onScroll={measureScroll}
      >
        {about && (
          <section className="brain-box-privacy" aria-label="About this chat">
            <h3>Before you send</h3>
            {session ? (
              <>
                <p>{session.notice}</p>
                <p>Provider: {session.provider}</p>
                <p>
                  Visitor access expires{" "}
                  {new Date(session.expiresAt).toLocaleString()}. Conversation
                  retention: idle limit {session.retention.idleSeconds / 3600}{" "}
                  hours; maximum age {session.retention.maxAgeSeconds / 3600}{" "}
                  hours.
                </p>
                <p>{session.deletionLimitations}</p>
              </>
            ) : (
              <p>
                Chat is not ready. Provider and retention information will be
                shown here before sending is available.
              </p>
            )}
            <button
              type="button"
              ref={aboutClose}
              className="brain-box-quiet"
              onClick={(): void => {
                toggleAbout();
                aboutButton.current?.focus({ preventScroll: true });
              }}
            >
              Close
            </button>
          </section>
        )}
        {welcome && (
          <div className="brain-box-welcome">
            <h2 id="brain-chat-heading" className="display">
              {copy.title}
            </h2>
            <p className="chat-notice">
              Explore this Brain’s public knowledge.
            </p>
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
        {!welcome && (
          <h2 id="brain-chat-heading" className="brain-box-sr-only">
            {copy.title}
          </h2>
        )}
        {earlier.length > 0 && (
          <details className="brain-box-earlier">
            <summary>Earlier text · not resent</summary>
            <GuestTranscript messages={earlier} />
          </details>
        )}
        <GuestTranscript messages={messages} />
        <p
          className={`brain-box-activity${state === "complete" && !busy ? " is-complete" : ""}`}
          role="status"
          aria-live="polite"
        >
          {activity || (state === "complete" ? "Answer received." : "")}
        </p>
        {notice && (
          <section
            className="brain-box-notice"
            role="status"
            aria-live="polite"
          >
            {notice}
            <div className="brain-box-actions">
              {props.canCheck && (
                <button
                  type="button"
                  className="brain-box-action"
                  disabled={busy}
                  onClick={(): void => {
                    void props.onCheck();
                  }}
                >
                  Check answer
                </button>
              )}
              {(state === "uncertain" ||
                state === "incomplete" ||
                state === "expired" ||
                state === "history-unavailable") &&
                newQuestion()}
              {state === "unavailable" && (
                <button
                  type="button"
                  className="brain-box-action"
                  disabled={busy}
                  onClick={(): void => {
                    void props.onAvailability();
                  }}
                >
                  Check availability
                </button>
              )}
            </div>
          </section>
        )}
        {busy && (state === "sending" || state === "working") && (
          <button
            className="brain-box-quiet"
            type="button"
            onClick={props.onStopWaiting}
          >
            Stop waiting
          </button>
        )}
        {confirmFresh && (
          <section className="brain-box-notice">
            <h3>Start a separate question?</h3>
            <p>
              The earlier one may still finish. We’ll check availability first.
              This won’t cancel, delete or repeat it, or reset any limit.
            </p>
            <div className="brain-box-actions">
              <button
                ref={confirmation}
                type="button"
                className="brain-box-action"
                disabled={busy}
                onClick={(): void => {
                  void props.onFresh().then((started) => {
                    if (started) {
                      setConfirmFresh(false);
                      input.current?.focus();
                    }
                  });
                }}
              >
                Continue
              </button>
              <button
                className="brain-box-quiet"
                disabled={busy}
                type="button"
                onClick={(): void => {
                  setConfirmFresh(false);
                  freshButton.current?.focus();
                }}
              >
                Go back
              </button>
            </div>
          </section>
        )}
        {props.actionNotice && (
          <p className="brain-box-notice" role="status">
            {props.actionNotice}
          </p>
        )}
      </div>
      <div className="brain-box-bottom">
        {latest && !about && (
          <button
            className="brain-box-latest"
            type="button"
            onClick={(): void => {
              if (scroll.current)
                scroll.current.scrollTop = scroll.current.scrollHeight;
              measureScroll();
            }}
          >
            Latest ↓
          </button>
        )}
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="prompt-row">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              aria-label={welcome ? copy.title : "Your follow-up"}
              aria-describedby="brain-chat-notice"
              aria-invalid={over > 0}
              placeholder={welcome ? copy.inputHint : "Ask a follow-up…"}
              onInput={(event): void =>
                props.setDraft(event.currentTarget.value)
              }
              onKeyDown={(event): void => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button
              className="send"
              type="submit"
              aria-label="Send question"
              disabled={!props.canSend || busy || over > 0 || !draft.trim()}
            >
              ↑
            </button>
          </div>
          <p
            id="brain-chat-notice"
            className={`brain-box-hint${over > 0 ? " invalid" : ""}`}
          >
            {over > 0
              ? `${over} characters over the limit.`
              : busy && messages.length > 0
                ? "You can draft while you wait."
                : messages.length > 0
                  ? null
                  : "Public knowledge. Please avoid private details."}
          </p>
        </form>
      </div>
    </div>
  );
}
