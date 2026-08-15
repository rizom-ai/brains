import { z } from "@brains/utils/zod";
import type {
  GitLogEntry,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  GitSyncStatus,
  PullResult,
} from "../../types";

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

const checkpointSchema = z
  .object({
    remoteFingerprint: z.string().min(1),
    branch: z.string().min(1),
    lastReconciledGitHead: z.string().min(1),
    lastObservedRemoteHead: z.string().optional(),
  })
  .strict();

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
        checkpoint: checkpointSchema.optional(),
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

/** What each operation answers with. */
export interface GitOperationResultMap {
  initialize: void;
  "get-status": GitSyncStatus;
  "has-local-changes": boolean;
  commit: void;
  push: void;
  "commit-and-push": {
    pushed: boolean;
    checkpoint: GitReconciliationCheckpoint | null;
  };
  pull: PullResult;
  "get-reconciliation-delta": GitReconciliationDelta;
  "get-checkpoint": GitReconciliationCheckpoint;
  "log-file": GitLogEntry[];
  "show-file": string;
}

export type GitOperationResult<
  TName extends GitOperationName = GitOperationName,
> = GitOperationResultMap[TName];

/** An operation that answers with nothing still has to answer. */
const nothing = z
  .union([z.null(), z.undefined()])
  .transform((): void => undefined);

const resultSchemas: {
  [K in GitOperationName]: z.ZodType<GitOperationResultMap[K], unknown>;
} = {
  initialize: nothing,
  commit: nothing,
  push: nothing,
  "has-local-changes": z.boolean(),
  "show-file": z.string(),
  "get-checkpoint": checkpointSchema,
  "get-status": z
    .object({
      isRepo: z.boolean(),
      hasChanges: z.boolean(),
      ahead: z.number().int(),
      behind: z.number().int(),
      branch: z.string(),
      lastCommit: z.string().optional(),
      remote: z.string().optional(),
      files: z.array(
        z.object({ path: z.string(), status: z.string() }).strict(),
      ),
    })
    .strict(),
  "commit-and-push": z
    .object({
      pushed: z.boolean(),
      checkpoint: checkpointSchema.nullable(),
    })
    .strict(),
  pull: z
    .object({
      files: z.array(z.string()),
      deletedFiles: z.array(z.string()).optional(),
    })
    .strict(),
  "get-reconciliation-delta": z.discriminatedUnion("mode", [
    z
      .object({
        mode: z.literal("incremental"),
        checkpoint: checkpointSchema,
        files: z.array(z.string()),
        deletedFiles: z.array(z.string()),
      })
      .strict(),
    z
      .object({
        mode: z.literal("full"),
        checkpoint: checkpointSchema,
        reason: z.enum([
          "missing-checkpoint",
          "repository-identity-mismatch",
          "branch-mismatch",
          "missing-local-checkpoint",
          "non-ancestor-local-checkpoint",
          "remote-checkpoint-mismatch",
        ]),
      })
      .strict(),
  ]),
  "log-file": z.array(
    z
      .object({
        sha: z.string(),
        date: z.string(),
        message: z.string(),
      })
      .strict(),
  ),
};

/**
 * Check a result before anyone treats it as typed.
 *
 * The value arrives as `unknown` and used to be widened by an assertion, so a
 * broker answering with the wrong shape produced something the caller believed
 * was a `GitSyncStatus`. Parsing keeps the type claim earned rather than
 * asserted, and it is the last unchecked thing crossing the socket.
 */
export function parseGitOperationResult<TName extends GitOperationName>(
  name: TName,
  value: unknown,
): GitOperationResultMap[TName] {
  // Total by construction: `resultSchemas` is a mapped type over every
  // operation name, so a new operation cannot be added without one.
  return resultSchemas[name].parse(value);
}
