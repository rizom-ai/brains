import { QueryClient } from "@tanstack/react-query";

/**
 * CMS owns its query cache. Server state is never shared with another console
 * surface, persisted to browser storage, or retried implicitly.
 */
export function createCmsQueryClient(): QueryClient {
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
