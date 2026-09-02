import {
  DEFAULT_CHAT_API_PATH,
  createChatApiPaths,
  createChatClient,
  type ChatApiPaths,
  type ChatClient,
  type ChatClientOptions,
} from "@brains/contracts/chat";

export function getWebChatApiPath(): string {
  if (typeof document === "undefined") return DEFAULT_CHAT_API_PATH;
  return (
    document
      .querySelector<HTMLElement>("[data-web-chat-root]")
      ?.getAttribute("data-chat-api-path") ?? DEFAULT_CHAT_API_PATH
  );
}

export function getWebChatApiPaths(): ChatApiPaths {
  return createChatApiPaths(getWebChatApiPath());
}

export function createWebChatClient(
  options: Omit<ChatClientOptions, "apiPath"> = {},
): ChatClient {
  return createChatClient({
    ...options,
    apiPath: getWebChatApiPath(),
  });
}
