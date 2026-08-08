import { ConfirmationArgsStore } from "./confirmation-args-store";
import type { ToolResponse } from "./types";

export interface ConfirmationGate {
  /**
   * Validate a confirmed call against its pending approval. Returns the
   * error response when the token is absent, expired, or the args were
   * changed after approval; undefined when the replay is intact.
   */
  validateConfirmed(
    confirmationToken: string | undefined,
    args: unknown,
  ): ToolResponse | undefined;
  /** Mint a token and build the args the interface replays on approval. */
  buildArgs<TArgs>(build: (confirmationToken: string) => TArgs): TArgs;
  /**
   * Consume the pending approval behind a token and return its stored
   * args, tolerating a mangled replay. Callers must verify the stored
   * args target the same operation before honoring the confirmation.
   */
  takePending(confirmationToken: string | undefined): unknown;
}

/**
 * Shared integrity gate for the propose → confirm → execute tool contract.
 * Every confirmable tool goes through this so a fabricated confirmation
 * (or args edited after approval) is always rejected — no tool gets to
 * opt out of replay/tamper protection.
 */
export function createConfirmationGate(options: {
  /** Word used in error prose for the tool's action, e.g. "delete". */
  label: string;
  /** Noun for the re-request instruction, e.g. "deletion". */
  requestNoun: string;
}): ConfirmationGate {
  const store = new ConfirmationArgsStore();
  const retry = `Please request ${options.requestNoun} again and confirm the new approval.`;
  return {
    validateConfirmed(confirmationToken, args): ToolResponse | undefined {
      const validation = store.validate(confirmationToken, args);
      if (validation.status === "missing") {
        return {
          success: false,
          error: `No pending ${options.label} confirmation found. ${retry}`,
        };
      }
      if (validation.status === "mismatch") {
        return {
          success: false,
          error: `Confirmed ${options.label} arguments do not match the pending approval. ${retry}`,
        };
      }
      return undefined;
    },
    buildArgs<TArgs>(build: (confirmationToken: string) => TArgs): TArgs {
      return store.create(build);
    },
    takePending(confirmationToken): unknown {
      return store.take(confirmationToken);
    },
  };
}
