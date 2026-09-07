import { useCallback, useEffect, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { ChatClient, ChatSession } from "@brains/contracts/chat";
import { studioChatWorkspacePath } from "../../src/chat-workspace";
import { studioChatKeys, type SessionView } from "./studio-chat-contracts";

/** How long a search box sits still before it becomes a request. */
const SESSION_SEARCH_DEBOUNCE_MS = 250;

export interface ChatSessionControls {
  search: string;
  view: SessionView;
  error: string | null;
  onRetry: () => void;
  onSearch: (value: string) => void;
  onView: (view: SessionView) => void;
}

export interface ChatSessionsInput {
  chatClient: Pick<ChatClient, "listSessions">;
  queryClient: QueryClient;
  sessionId: string | null;
  studioBasePath: string;
  navigate: (href: string, options?: { preserveWork?: boolean }) => void;
}

export interface ChatSessions {
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  archivedSession: boolean;
  sessionControls: ChatSessionControls;
  sessionsLoading: boolean;
  navigateToSession: (conversationId?: string, preserveWork?: boolean) => void;
  sessionPickerOpen: boolean;
  setSessionPickerOpen: (open: boolean) => void;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  /** Collapse the picker and the details panel without navigating. */
  closeDisclosures: () => void;
}

/**
 * The session list behind Studio Chat: its search, paging and the two
 * disclosures that open over it. The current session is resolved from any
 * cached page, because a conversation opened by id may not be on the page the
 * rail is showing.
 */
export function useChatSessions(input: ChatSessionsInput): ChatSessions {
  const { chatClient, queryClient, sessionId, studioBasePath, navigate } =
    input;
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
      SESSION_SEARCH_DEBOUNCE_MS,
    );
    return (): void => window.clearTimeout(timer);
  }, [sessionSearch]);

  const sessionsQuery = useQuery({
    queryKey: [...studioChatKeys.sessions, sessionView],
    queryFn: () => chatClient.listSessions(sessionView),
  });
  const sessions = sessionsQuery.data ?? [];
  const currentSession =
    sessions.find((session) => session.id === sessionId) ??
    queryClient
      .getQueriesData<ChatSession[]>({ queryKey: studioChatKeys.sessions })
      .flatMap(([, items]) => items ?? [])
      .find((session) => session.id === sessionId);

  const closeDisclosures = useCallback((): void => {
    setSessionPickerOpen(false);
    setDetailsOpen(false);
  }, []);

  const navigateToSession = useCallback(
    (conversationId?: string, preserveWork = false): void => {
      navigate(studioChatWorkspacePath(studioBasePath, conversationId), {
        preserveWork,
      });
      closeDisclosures();
    },
    [navigate, studioBasePath, closeDisclosures],
  );

  return {
    sessions,
    currentSession,
    archivedSession: currentSession?.archived === true,
    sessionControls: {
      search: sessionSearch,
      view: sessionView,
      error: sessionsQuery.error ? "Sessions could not be loaded." : null,
      onRetry: (): void => {
        void sessionsQuery.refetch();
      },
      onSearch: setSessionSearch,
      onView: setSessionView,
    },
    sessionsLoading: sessionsQuery.isPending,
    navigateToSession,
    sessionPickerOpen,
    setSessionPickerOpen,
    detailsOpen,
    setDetailsOpen,
    closeDisclosures,
  };
}
