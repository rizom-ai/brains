import { QueryClient } from "@tanstack/react-query";

/** Admin owns a private, in-memory server-state cache for this console only. */
export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
