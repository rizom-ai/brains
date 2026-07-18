import { QueryClient } from "@tanstack/react-query";

/** Web chat owns an unpersisted server cache separate from active AI streams. */
export function createWebChatQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
