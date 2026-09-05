import { z } from "@brains/utils/zod";
import {
  gitLogEntrySchema,
  gitReconciliationCheckpointSchema,
  gitReconciliationDeltaSchema,
  gitSyncStatusSchema,
  pullResultSchema,
} from "../../types/results";

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

export const GIT_OPERATIONS: readonly [
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
] = [
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
];

export type GitOperationName = (typeof GIT_OPERATIONS)[number];

/** Operations that may change the checkout, and so must never be replayed. */
export const MUTATING_OPERATIONS: ReadonlySet<GitOperationName> =
  new Set<GitOperationName>([
    "initialize",
    "commit",
    "push",
    "commit-and-push",
    "pull",
  ]);

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

export const gitOperationSchema: z.ZodDiscriminatedUnion<
  [
    Strict<{ name: z.ZodLiteral<"initialize"> }>,
    Strict<{ name: z.ZodLiteral<"get-status"> }>,
    Strict<{ name: z.ZodLiteral<"has-local-changes"> }>,
    Strict<{
      name: z.ZodLiteral<"commit">;
      message: z.ZodOptional<z.ZodString>;
    }>,
    Strict<{ name: z.ZodLiteral<"push"> }>,
    Strict<{ name: z.ZodLiteral<"commit-and-push"> }>,
    Strict<{ name: z.ZodLiteral<"pull"> }>,
    Strict<{
      name: z.ZodLiteral<"get-reconciliation-delta">;
      checkpoint: z.ZodOptional<typeof gitReconciliationCheckpointSchema>;
    }>,
    Strict<{ name: z.ZodLiteral<"get-checkpoint"> }>,
    Strict<{
      name: z.ZodLiteral<"log-file">;
      filePath: z.ZodString;
      limit: z.ZodOptional<z.ZodNumber>;
    }>,
    Strict<{
      name: z.ZodLiteral<"show-file">;
      sha: z.ZodString;
      filePath: z.ZodString;
    }>,
  ],
  "name"
> = z.discriminatedUnion("name", [
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
      checkpoint: gitReconciliationCheckpointSchema.optional(),
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

export type GitOperation = z.output<typeof gitOperationSchema>;

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

/** An operation that answers with nothing still has to answer. */
const nothing: z.ZodPipe<
  z.ZodUnion<readonly [z.ZodNull, z.ZodUndefined]>,
  z.ZodTransform<void, null | undefined>
> = z.union([z.null(), z.undefined()]).transform((): void => undefined);

const commitAndPushResultSchema: z.ZodObject<
  {
    pushed: z.ZodBoolean;
    checkpoint: z.ZodNullable<typeof gitReconciliationCheckpointSchema>;
  },
  z.core.$strict
> = z.strictObject({
  pushed: z.boolean(),
  checkpoint: gitReconciliationCheckpointSchema.nullable(),
});

/** The schema each operation's answer is checked by. */
interface GitOperationResultSchemas {
  initialize: typeof nothing;
  "get-status": typeof gitSyncStatusSchema;
  "has-local-changes": z.ZodBoolean;
  commit: typeof nothing;
  push: typeof nothing;
  "commit-and-push": typeof commitAndPushResultSchema;
  pull: typeof pullResultSchema;
  "get-reconciliation-delta": typeof gitReconciliationDeltaSchema;
  "get-checkpoint": typeof gitReconciliationCheckpointSchema;
  "log-file": z.ZodArray<typeof gitLogEntrySchema>;
  "show-file": z.ZodString;
}

const resultSchemas: GitOperationResultSchemas = {
  initialize: nothing,
  commit: nothing,
  push: nothing,
  "has-local-changes": z.boolean(),
  "show-file": z.string(),
  "get-checkpoint": gitReconciliationCheckpointSchema,
  "get-status": gitSyncStatusSchema,
  "commit-and-push": commitAndPushResultSchema,
  pull: pullResultSchema,
  "get-reconciliation-delta": gitReconciliationDeltaSchema,
  "log-file": z.array(gitLogEntrySchema),
};

/**
 * What each operation answers with.
 *
 * Total by construction: the map indexes the result schemas by every
 * operation name, so a new operation cannot be added without one.
 */
export type GitOperationResultMap = {
  [K in GitOperationName]: z.output<GitOperationResultSchemas[K]>;
};

export type GitOperationResult<
  TName extends GitOperationName = GitOperationName,
> = GitOperationResultMap[TName];

/** The same schemas, viewed uniformly so a name picks its parser. */
const resultParsers: {
  [K in GitOperationName]: z.ZodType<GitOperationResultMap[K], unknown>;
} = resultSchemas;

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
  return resultParsers[name].parse(value);
}
