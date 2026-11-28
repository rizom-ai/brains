/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import type { ChatSession } from "@brains/contracts/chat";
import { useAppFetch } from "@brains/app-ui-react";
import type * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { STUDIO_CHAT_ROUTE_PATH } from "../../src/chat-workspace";
import { studioEntityPath } from "../../src/studio-paths";
import { getStudioRouterBasePath } from "./studio-router";
import type { StudioHome, StudioHomeAttention } from "../../src/home-contract";
import { isPlainLinkClick } from "./link-click";
import { useStudioApi } from "./studio-api-context";
import { homeStyles as styles } from "./studio-home.styles";
import { homeDate, homeSentence, noteFromText } from "./studio-home-model";
import { editorClassName } from "./studio-editor.styles";
import { StudioStatus } from "./studio-status";
import { formatUpdated } from "./ui-utils";

/** How often Home asks again while it stays open. */
const HOME_REFRESH_MS = 15_000;
/** Conversations Continue brings back. */
const CONVERSATION_LIMIT = 2;

export interface StudioHomeProps {
  /** Opens a Studio path in place. */
  onNavigate: (href: string) => void;
  /** Opens Chat with the text ready to send. */
  onAsk: (text: string) => void;
  /** The Chat API, when this brain has Chat; Continue lists its conversations. */
  chatApiPath?: string | undefined;
}

/** A link that opens in place on a plain click, like every Studio link. */
function HomeLink(props: {
  href: string;
  onNavigate: (href: string) => void;
  className: string;
  children: ReactElement | (ReactElement | string)[] | string;
}): ReactElement {
  return (
    <a
      href={props.href}
      className={props.className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainLinkClick(event)) return;
        event.preventDefault();
        props.onNavigate(props.href);
      }}
    >
      {props.children}
    </a>
  );
}

function cx(...styles: stylex.StyleXStyles[]): string {
  return editorClassName("", ...styles).trim();
}

const dotStyle: Record<StudioHomeAttention["severity"], stylex.StyleXStyles> = {
  error: styles.dotError,
  warn: styles.dotWarn,
  info: styles.dotInfo,
};

const statusStyle: Record<StudioHome["status"]["tone"], stylex.StyleXStyles> = {
  good: styles.statusGood,
  warn: styles.statusWarn,
  error: styles.statusError,
};

function NeedsYou(props: {
  items: StudioHome["needsYou"];
  onNavigate: (href: string) => void;
}): ReactElement {
  return (
    <section aria-labelledby="home-needs-you">
      <h2 id="home-needs-you" className={cx(styles.bandHead)}>
        Needs you
        {props.items.length > 0 && (
          <span className={cx(styles.bandCount)}>{props.items.length}</span>
        )}
      </h2>
      {props.items.length === 0 ? (
        <p className={cx(styles.allClear)}>Nothing is waiting on you.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {props.items.map((item) => (
            <li
              key={item.id}
              data-home-attention={item.severity}
              className={cx(styles.attention)}
            >
              <span
                aria-hidden="true"
                className={cx(styles.dot, dotStyle[item.severity])}
              />
              <div className={cx(styles.attentionText)}>
                <p className={cx(styles.attentionTitle)}>{item.title}</p>
                {item.detail && (
                  <p className={cx(styles.attentionDetail)}>{item.detail}</p>
                )}
              </div>
              {item.action && (
                <span className={cx(styles.attentionAction)}>
                  <Button
                    type="button"
                    variant={
                      item.severity === "error" ? "primary" : "secondary"
                    }
                    size="sm"
                    onClick={() => {
                      if (item.action) props.onNavigate(item.action.href);
                    }}
                  >
                    {item.action.label}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Continue(props: {
  drafts: StudioHome["drafts"];
  conversations: readonly ChatSession[];
  onNavigate: (href: string) => void;
}): ReactElement | null {
  if (props.drafts.length === 0 && props.conversations.length === 0)
    return null;
  return (
    <section aria-labelledby="home-continue">
      <h2 id="home-continue" className={cx(styles.bandHead)}>
        Continue
      </h2>
      {props.drafts.map((draft) => (
        <HomeLink
          key={`${draft.entityType}/${draft.id}`}
          href={draft.href}
          onNavigate={props.onNavigate}
          className={cx(styles.card)}
        >
          <span className={cx(styles.cardMeta)}>
            <span className={cx(styles.draftBadge)}>Draft</span>
            {`${draft.typeLabel}, edited ${formatUpdated(draft.updated)}`}
          </span>
          <p className={cx(styles.cardTitle)}>{draft.title}</p>
        </HomeLink>
      ))}
      {props.conversations.map((session) => (
        <HomeLink
          key={session.id}
          href={`${STUDIO_CHAT_ROUTE_PATH}?session=${encodeURIComponent(session.id)}`}
          onNavigate={props.onNavigate}
          className={cx(styles.card)}
        >
          <span className={cx(styles.cardMeta)}>
            {`Conversation, ${formatUpdated(session.lastActiveAt)}`}
          </span>
          <p className={cx(styles.cardTitle)}>{session.title}</p>
        </HomeLink>
      ))}
    </section>
  );
}

function RecentlyPublished(props: {
  published: StudioHome["published"];
  onNavigate: (href: string) => void;
}): ReactElement | null {
  if (props.published.length === 0) return null;
  return (
    <section aria-labelledby="home-published">
      <h2 id="home-published" className={cx(styles.bandHead)}>
        Recently published
      </h2>
      {props.published.map((entry) => (
        <HomeLink
          key={`${entry.entityType}/${entry.id}`}
          href={entry.href}
          onNavigate={props.onNavigate}
          className={cx(styles.published)}
        >
          <span className={cx(styles.publishedTitle)}>{entry.title}</span>
          <time
            dateTime={entry.publishedAt}
            className={cx(styles.publishedDate)}
          >
            {new Date(entry.publishedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </time>
        </HomeLink>
      ))}
    </section>
  );
}

/** The capture box: a note saved without choosing a type, or a question for Chat. */
function Composer(props: {
  onAsk: (text: string) => void;
  onNavigate: (href: string) => void;
  canAsk: boolean;
}): ReactElement {
  const api = useStudioApi();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<{ href: string; title: string } | null>(
    null,
  );
  const save = useMutation({
    mutationFn: async (value: string) => {
      const note = noteFromText(value);
      if (!note) throw new Error("Write a few words to save a note.");
      // A note is plain Markdown: its first heading is its title.
      const result = await api.createEntity({
        entityType: "note",
        idPath: [note.slug],
        frontmatter: {},
        body: note.body,
      });
      return { title: note.title, entityId: result.entityId };
    },
    onSuccess: ({ title, entityId }) => {
      setText("");
      setSaved({
        title,
        href: studioEntityPath(getStudioRouterBasePath(), "note", entityId),
      });
    },
  });
  const trimmed = text.trim();
  const ask = (): void => {
    if (!trimmed || !props.canAsk) return;
    props.onAsk(trimmed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter") return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      ask();
    } else if (event.shiftKey && trimmed) {
      event.preventDefault();
      save.mutate(trimmed);
    }
  };
  return (
    <div data-home-composer="" className={cx(styles.composer)}>
      <textarea
        aria-label="Write something down, or ask your brain"
        rows={2}
        value={text}
        placeholder="Write something down, or ask your brain…"
        className={cx(styles.composerInput)}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(null);
          save.reset();
        }}
        onKeyDown={onKeyDown}
      />
      <div className={cx(styles.composerBar)}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!trimmed || save.isPending}
          onClick={() => save.mutate(trimmed)}
        >
          {save.isPending ? "Saving…" : "Save as note"}
        </Button>
        {props.canAsk && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!trimmed}
            onClick={ask}
          >
            Ask
          </Button>
        )}
        <span className={cx(styles.composerHint)}>
          {props.canAsk ? "⌘↵ asks · ⇧↵ saves" : "⇧↵ saves"}
        </span>
      </div>
      {(saved ?? save.error) && (
        <p role="status" className={cx(styles.composerNote)}>
          {saved ? (
            <>
              Saved as a note.{" "}
              <HomeLink
                href={saved.href}
                onNavigate={props.onNavigate}
                className={cx(styles.link)}
              >
                Open it
              </HomeLink>
            </>
          ) : (
            (save.error?.message ?? "")
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The person's latest conversations, read from Chat's sessions route. The
 * Chat client stays in Chat's own lazy chunk, so Home asks the route itself.
 */
function useConversations(apiPath: string | undefined): readonly ChatSession[] {
  const appFetch = useAppFetch();
  const { data } = useQuery({
    queryKey: ["studio", "home", "conversations", apiPath ?? ""],
    queryFn: async () => {
      // Loaded with Chat, so the Chat contracts stay out of the first bundle.
      const { chatSessionsResponseSchema } =
        await import("@brains/contracts/chat");
      const base = (apiPath ?? "").replace(/\/+$/, "");
      const response = await (appFetch ?? fetch)(
        `${base}/sessions?limit=${CONVERSATION_LIMIT}`,
      );
      if (!response.ok) return [];
      return chatSessionsResponseSchema
        .parse(await response.json())
        .sessions.slice(0, CONVERSATION_LIMIT);
    },
    enabled: apiPath !== undefined,
    refetchInterval: HOME_REFRESH_MS,
  });
  return data ?? [];
}

/**
 * Home: one sentence, a box to write or ask, what needs the person, what
 * they were in the middle of, what went out, and the brain's health.
 */
export function StudioHomeView(props: StudioHomeProps): ReactElement {
  const api = useStudioApi();
  const { data, error } = useQuery({
    queryKey: ["studio", "home"],
    queryFn: () => api.fetchHome(),
    refetchInterval: HOME_REFRESH_MS,
  });
  const conversations = useConversations(props.chatApiPath);
  if (!data) {
    return (
      <main className={cx(styles.page)}>
        <StudioStatus {...(error ? { tone: "error" as const } : {})}>
          {error
            ? "Home could not be read. It tries again shortly."
            : "Loading…"}
        </StudioStatus>
      </main>
    );
  }
  return (
    <main data-studio-home="" className={cx(styles.page)}>
      <header className="studio-page-head">
        <p className={cx(styles.date)}>{homeDate(data.now)}</p>
        <h1 className={cx(styles.sentence)}>
          {homeSentence({
            needs: data.needsYou.length,
            drafts: data.drafts.length,
          })}
        </h1>
      </header>
      <Composer
        onAsk={props.onAsk}
        onNavigate={props.onNavigate}
        canAsk={props.chatApiPath !== undefined}
      />
      <div className={cx(styles.columns)}>
        <NeedsYou items={data.needsYou} onNavigate={props.onNavigate} />
        <div>
          <Continue
            drafts={data.drafts}
            conversations={conversations}
            onNavigate={props.onNavigate}
          />
          <div style={{ marginTop: 28 }}>
            <RecentlyPublished
              published={data.published}
              onNavigate={props.onNavigate}
            />
          </div>
        </div>
      </div>
      <footer role="status" className={cx(styles.status)}>
        <span
          aria-hidden="true"
          className={cx(styles.statusDot, statusStyle[data.status.tone])}
        />
        <span className={cx(styles.statusText)}>{data.status.text}</span>
        <HomeLink
          href={data.status.history.href}
          onNavigate={props.onNavigate}
          className={cx(styles.link)}
        >
          {data.status.history.label}
        </HomeLink>
      </footer>
    </main>
  );
}
