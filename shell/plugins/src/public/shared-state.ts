import type { SharedState } from "@brains/contracts";

export {
  defineSharedState,
  isSharedState,
  sharedStateNamespace,
  type SharedState,
} from "@brains/contracts";

/** Refuse a shared state the package does not own. */
export function assertSharedStateOwner(
  state: SharedState<unknown, unknown>,
  packageName: string,
): void {
  if (!state.name.startsWith(`${packageName}:`)) {
    throw new Error(
      `Package "${packageName}" writes only shared state named "${packageName}:<name>", and "${state.name}" is not one`,
    );
  }
}
