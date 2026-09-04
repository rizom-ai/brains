/** @jsxImportSource react */
import {
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  ChatClient,
  ChatClientOptions,
  ChatFetch,
} from "@brains/contracts/chat";
import { createWebChatClient } from "./web-chat-client";

/**
 * The transport every web-chat API call goes through.
 *
 * Production never provides one and the chat client reaches the global fetch,
 * the same as before. A test wraps the tree in WebChatFetchProvider with a
 * fake and reads the requests off it, instead of reassigning globalThis.fetch
 * for the whole process and restoring it afterwards.
 */
const WebChatFetchContext = createContext<ChatFetch | undefined>(undefined);

export function WebChatFetchProvider(props: {
  fetch: ChatFetch;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <WebChatFetchContext.Provider value={props.fetch}>
      {props.children}
    </WebChatFetchContext.Provider>
  );
}

export function useWebChatFetch(): ChatFetch | undefined {
  return useContext(WebChatFetchContext);
}

/** The chat client for this tree, built on whichever fetch the tree provides. */
export function useWebChatClient(
  options: Pick<ChatClientOptions, "credentials"> = {},
): ChatClient {
  const fetchFn = useWebChatFetch();
  const { credentials } = options;
  return useMemo(
    () => createWebChatClient({ fetch: fetchFn, credentials }),
    [fetchFn, credentials],
  );
}
