import { z } from "@brains/utils/zod";
import { NavigationSlots } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

const navigationQuerySchema = z.object({
  slot: z.enum(NavigationSlots).optional().default("primary"),
  limit: z.number().optional(),
});

/** One entry in a site menu. */
export interface NavigationItem {
  readonly label: string;
  readonly href: string;
}

/**
 * The menu for one navigation slot, read off the registered routes.
 *
 * Templates ask for a slot and get what is registered into it. Whoever
 * registered the route decided it belonged in the menu; this only reads.
 */
export function navigationFor(
  routes: RouteRegistry,
  query: unknown,
): { navigation: NavigationItem[] } {
  const params = navigationQuerySchema.parse(query ?? {});
  const items = routes.getNavigationItems(params.slot);
  const limited = params.limit ? items.slice(0, params.limit) : items;
  return {
    navigation: limited.map((item) => ({
      label: item.label,
      href: item.href,
    })),
  };
}
