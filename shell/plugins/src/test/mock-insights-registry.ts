import type { IInsightsRegistry, InsightHandler } from "../index";

/**
 * An InsightsRegistry double that really dispatches.
 *
 * Asking for a type nobody registered throws with the registered types
 * listed, because a missing insight and a mistyped one look identical
 * otherwise.
 */
export function createMockInsightsRegistry(): IInsightsRegistry {
  const insightHandlers = new Map<string, InsightHandler>();
  const insightsRegistry: IInsightsRegistry = {
    register: (type: string, handler: InsightHandler) => {
      insightHandlers.set(type, handler);
    },
    unregister: (type: string) => {
      insightHandlers.delete(type);
    },
    getTypes: () => Array.from(insightHandlers.keys()),
    get: async (type: string, es, visibilityScope) => {
      const handler = insightHandlers.get(type);
      if (!handler)
        throw new Error(
          `Unknown insight type: ${type}. Available: ${Array.from(insightHandlers.keys()).join(", ")}`,
        );
      return handler(es, visibilityScope);
    },
  };

  return insightsRegistry;
}
