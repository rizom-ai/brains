import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";

export type ProfileDisplayNameResolver = (
  profileEntityId: string,
) => Promise<string | undefined>;

/**
 * Resolve a Studio profile display name, failing closed to `undefined` on missing
 * input or lookup error. Whitespace-only names are treated as absent.
 */
export async function resolveProfileDisplayNameSafely(
  resolve: ProfileDisplayNameResolver | undefined,
  profileEntityId: string | null,
  logger?: Logger,
): Promise<string | undefined> {
  if (!profileEntityId || !resolve) return undefined;
  try {
    const displayName = await resolve(profileEntityId);
    const trimmed = displayName?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    logger?.warn("Failed to resolve Studio profile display name", {
      profileEntityId,
      error: getErrorMessage(error, "Profile lookup failed"),
    });
    return undefined;
  }
}
