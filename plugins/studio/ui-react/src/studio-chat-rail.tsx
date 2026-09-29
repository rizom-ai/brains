/** @jsxImportSource react */
import { Button, NativeSelect } from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";
import { typographyStyles } from "./studio-typography.styles";
import { type ChatSession } from "@brains/contracts/chat";
import { type ReactElement } from "react";
import {
  StudioCollectionBar,
  StudioCollectionPager,
} from "./studio-collection-controls";
import type { SessionView } from "./studio-chat-contracts";

export function SessionRail(props: {
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
