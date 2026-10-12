import { AnalyticsRegistry, type IAnalyticsRegistry } from "../index";

/**
 * The real registry, empty: a double that dispatched on its own would have
 * to restate the floor and params checks the tool relies on.
 */
export function createMockAnalyticsRegistry(): IAnalyticsRegistry {
  return new AnalyticsRegistry();
}
