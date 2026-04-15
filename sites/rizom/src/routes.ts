import type { RouteDefinitionInput } from "@brains/plugins";

/**
 * Transitional shared Rizom route baseline.
 *
 * This shared package still ships a default route stack for direct
 * consumers of `@brains/site-rizom`, but app-owned wrappers should
 * treat it as a reusable baseline rather than the canonical final
 * composition for rizom.ai / rizom.foundation / rizom.work.
 *
 * In practice this baseline remains closest to the historical
 * rizom.ai structure while the remaining app ownership cleanup
 * continues.
 */
export const routes: RouteDefinitionInput[] = [];
