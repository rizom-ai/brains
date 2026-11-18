import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

/**
 * Runtime state namespaces whose feature is removed. Nothing reads them any
 * more, so a boot deletes what earlier releases left: the per-surface use
 * counts of the removed data-URL bridge for asset-backed content.
 */
export const RETIRED_RUNTIME_STATE_NAMESPACES: readonly string[] = [
  "shell.legacy-binary-content",
];

/** Delete every row of a retired namespace; a namespace already empty costs one query. */
export async function clearRetiredRuntimeState(
  runtimeState: IRuntimeStateNamespace,
  logger: Logger,
): Promise<void> {
  for (const namespace of RETIRED_RUNTIME_STATE_NAMESPACES) {
    const cleared = await runtimeState
      .scoped({ namespace, schema: z.unknown() })
      .clear();
    if (cleared > 0) {
      logger.info("Deleted retired runtime state", { namespace, cleared });
    }
  }
}
