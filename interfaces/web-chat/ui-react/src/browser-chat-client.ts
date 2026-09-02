import {
  DEFAULT_BROWSER_CHAT_API_PATH,
  createBrowserChatApiPaths,
  createBrowserChatClient,
  type BrowserChatApiPaths,
  type BrowserChatClient,
  type BrowserChatClientOptions,
} from "@brains/contracts/browser-chat";

export function getWebChatApiPath(): string {
  if (typeof document === "undefined") return DEFAULT_BROWSER_CHAT_API_PATH;
  return (
    document
      .querySelector<HTMLElement>("[data-web-chat-root]")
      ?.getAttribute("data-chat-api-path") ?? DEFAULT_BROWSER_CHAT_API_PATH
  );
}

export function getWebChatApiPaths(): BrowserChatApiPaths {
  return createBrowserChatApiPaths(getWebChatApiPath());
}

export function createWebChatClient(
  options: Omit<BrowserChatClientOptions, "apiPath"> = {},
): BrowserChatClient {
  return createBrowserChatClient({
    ...options,
    apiPath: getWebChatApiPath(),
  });
}
