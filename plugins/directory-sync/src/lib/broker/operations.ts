import { z } from "@brains/utils/zod";
import type { GitReconciliationCheckpoint } from "../../types";

/**
 * The closed set of Git operations a client may ask the broker to perform.
 *
 * Operations, not commands. A commit is `status`, `add -A`, marker checks, and
 * `commit`; a pull may commit local work, pull, resolve conflicts, and derive
 * changed paths. Serializing commands leaves those sequences interleavable —
 * `add -A` stages the whole working tree, so a second owner running inside the
 * first owner's commit gets its files committed by the first owner. That is
 * reproduced against real Git in `test/git/operation-atomicity.test.ts`.
 *
 * Two consequences follow, and both are deliberate:
 *
 * 1. **No argv.** Clients name an operation, never a Git argument vector, so
 *    the broker holds one turn for the whole sequence and no caller can
 *    compose a sequence the broker cannot see. The schemas are strict, so an
 *    argument vector cannot ride along on a known operation either.
 * 2. **No lease.** `IGitSync.withLock` is deliberately absent. A lease is a
 *    turn an application process holds across work the broker cannot see — in
 *    `pullAndQueue` it spans job-queue enqueueing — and the plan forbids
 *    exposing one a caller can forget to release. The sequencing it protected
 *    moves inside operations whose results carry what the caller needs, and
 *    durability stays with the reconciliation checkpoint rather than a held
 *    lock.
 *
 * `commit-and-push` exists because splitting that one sequence is unsafe in a
 * way splitting the others is not. Auto-export commits, pushes, and then
 * advances the reconciliation checkpoint to the resulting HEAD — "everything
 * to here is already queue work". If another owner pulls remote changes
 * between the push and the capture, the checkpoint moves past changes that
 * were never enqueued and they are silently never imported. The lease hid that
 * coupling; one owned operation makes it structural.
 */

export const GIT_OPERATIONS = [
  "initialize",
  "get-status",
  "has-local-changes",
  "commit",
  "push",
  "commit-and-push",
  "pull",
  "get-reconciliation-delta",
  "get-checkpoint",
  "log-file",
  "show-file",
] as const;

export type GitOperationName = (typeof GIT_OPERATIONS)[number];

export type GitOperation =
  | { name: "initialize" }
  | { name: "get-status" }
  | { name: "has-local-changes" }
  | { name: "commit"; message?: string | undefined }
  | { name: "push" }
  | { name: "commit-and-push" }
  | { name: "pull" }
  | {
      name: "get-reconciliation-delta";
      checkpoint?: GitReconciliationCheckpoint | undefined;
    }
  | { name: "get-checkpoint" }
  | { name: "log-file"; filePath: string; limit?: number | undefined }
  | { name: "show-file"; sha: string; filePath: string };

/** Operations that may change the checkout, and so must never be replayed. */
export const MUTATING_OPERATIONS: ReadonlySet<GitOperationName> =
  new Set<GitOperationName>([
    "initialize",
    "commit",
    "push",
    "commit-and-push",
    "pull",
  ]);

export const gitOperationSchema: z.ZodType<GitOperation, GitOperation> =
  z.discriminatedUnion("name", [
    z.object({ name: z.literal("initialize") }).strict(),
    z.object({ name: z.literal("get-status") }).strict(),
    z.object({ name: z.literal("has-local-changes") }).strict(),
    z
      .object({ name: z.literal("commit"), message: z.string().optional() })
      .strict(),
    z.object({ name: z.literal("push") }).strict(),
    z.object({ name: z.literal("commit-and-push") }).strict(),
    z.object({ name: z.literal("pull") }).strict(),
    z
      .object({
        name: z.literal("get-reconciliation-delta"),
        checkpoint: z
          .object({
            remoteFingerprint: z.string().min(1),
            branch: z.string().min(1),
            lastReconciledGitHead: z.string().min(1),
            lastObservedRemoteHead: z.string().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    z.object({ name: z.literal("get-checkpoint") }).strict(),
    z
      .object({
        name: z.literal("log-file"),
        filePath: z.string().min(1),
        limit: z.number().int().positive().optional(),
      })
      .strict(),
    z
      .object({
        name: z.literal("show-file"),
        sha: z.string().min(1),
        filePath: z.string().min(1),
      })
      .strict(),
  ]);

/**
 * True when running this operation twice could duplicate a mutation.
 *
 * Takes only the discriminant, so a caller holding a name — a journal entry,
 * a test enumerating the set — does not have to fabricate an operation.
 */
export function isMutatingOperation(
  operation: Pick<GitOperation, "name">,
): boolean {
  return MUTATING_OPERATIONS.has(operation.name);
}
