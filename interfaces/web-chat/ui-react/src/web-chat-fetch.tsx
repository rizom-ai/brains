/** @jsxImportSource react */
import { useMemo } from "react";
import { useAppFetch } from "@brains/app-ui-react";
import type { ChatClient, ChatClientOptions } from "@brains/contracts/chat";
import { createWebChatClient } from "./web-chat-client";

/**
 * The chat client for this tree, built on whichever transport the tree
 * provides. Production provides none and the client reaches the global fetch;
 * a test wraps the tree in `AppFetchProvider` and hands in a fake.
 */
export function useWebChatClient(
  options: Pick<ChatClientOptions, "credentials"> = {},
): ChatClient {
  const fetchFn = useAppFetch();
  const { credentials } = options;
  return useMemo(
    () => createWebChatClient({ fetch: fetchFn, credentials }),
    [fetchFn, credentials],
  );
}
