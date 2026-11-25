import {
  AtprotoRequestError,
  RepoGoneError,
  recordKeyOf,
  type ListedRecord,
  type PublicRepo,
  type PublicRepoReader,
} from "@brains/atproto-client";
import { siteBuildRequestContract } from "@brains/contracts";
import {
  classEntityServiceOf,
  internalFullScope,
  type ClassRuntimeState,
  type ClassRuntimeStateStore,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  referenceMetadataSchema,
  type ReferenceMetadata,
} from "../schemas/reference";
import { readAuthorName, sourceFieldsOf } from "./source-record";

/**
 * What the recheck keeps about one reference. Nobody reads or authors it,
 * so it stays out of the entity.
 */
export const sourceCheckStateSchema: z.ZodObject<{
  cid: z.ZodOptional<z.ZodString>;
  author: z.ZodOptional<z.ZodString>;
  lastCheckedAt: z.ZodOptional<z.ZodString>;
  lastError: z.ZodOptional<z.ZodString>;
  failureCount: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** The version of the record the entry's fields were last taken from. */
  cid: z.string().optional(),
  /** The byline that version was shown with. */
  author: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  lastError: z.string().optional(),
  failureCount: z.number().int().positive().optional(),
});

export type SourceCheckState = z.output<typeof sourceCheckStateSchema>;

type SourceCheckStore = ClassRuntimeStateStore<SourceCheckState>;

export function sourceCheckStore(state: ClassRuntimeState): SourceCheckStore {
  return state.scoped({
    namespace: "reference.source-checks",
    schema: sourceCheckStateSchema,
  });
}

/** What a recheck reads, writes and asks for. */
export interface RecheckContext {
  readonly entityService: Pick<
    ReturnType<typeof classEntityServiceOf>,
    "listEntities" | "getEntity" | "updateEntity"
  >;
  readonly checks: SourceCheckStore;
  readonly repos: PublicRepoReader;
  requestRebuild(reason: string): Promise<void>;
}

export function recheckContextOf(
  runtime: ServiceRuntime,
  repos: PublicRepoReader,
): RecheckContext {
  return {
    entityService: classEntityServiceOf(runtime),
    checks: sourceCheckStore(runtime.classRuntimeState),
    repos,
    requestRebuild: async (reason): Promise<void> => {
      await runtime.messaging.command(siteBuildRequestContract, { reason });
    },
  };
}

const allReferences = internalFullScope(
  "the recheck keeps every reference current, drafts included",
);

interface StoredReference {
  readonly entity: BaseEntity;
  readonly metadata: ReferenceMetadata;
}

type Outcome = "unchanged" | "updated" | "withdrawn" | "failed";

/** The repo an `at://` URI names. */
function repoOf(sourceUri: string): string | undefined {
  return /^at:\/\/([^/]+)\//.exec(sourceUri)?.[1];
}

function collectionOf(sourceUri: string): string | undefined {
  return /^at:\/\/[^/]+\/([^/]+)\//.exec(sourceUri)?.[1];
}

/** A reference's record as its author publishes it now, and their byline. */
interface Source {
  readonly record: ListedRecord;
  readonly author: string | undefined;
}

/**
 * What a PDS answers when the record, or the whole account, is no longer
 * published: said outright, never inferred from a timeout or a failure.
 */
const GONE_CODES = new Set([
  "RecordNotFound",
  "RepoNotFound",
  "RepoDeactivated",
  "RepoTakendown",
  "RepoSuspended",
]);

/** Whether a read failed because its author no longer publishes the source. */
function isSourceGone(error: unknown): boolean {
  return (
    error instanceof RepoGoneError ||
    (error instanceof AtprotoRequestError &&
      error.code !== undefined &&
      GONE_CODES.has(error.code))
  );
}

/** Write a reference's metadata over the version read; a newer one is left alone. */
async function writeMetadata(
  context: RecheckContext,
  stored: StoredReference,
  metadata: ReferenceMetadata,
): Promise<void> {
  await context.entityService.updateEntity({
    entity: { ...stored.entity, metadata },
    options: { expectedContentHash: stored.entity.contentHash },
  });
}

/**
 * Check one reference against its record: the same version changes
 * nothing, a new one updates the fields in place, a record or an account
 * that is gone withdraws the entry, and one that returned makes it active
 * again.
 * Anything else that goes wrong is thrown, and changes nothing.
 */
async function recheckOne(
  context: RecheckContext,
  stored: StoredReference,
  source: Source | undefined,
  state: SourceCheckState,
  now: string,
): Promise<Outcome> {
  const { metadata } = stored;

  if (!source) {
    if (metadata.sourceState === "withdrawn") return "unchanged";
    await writeMetadata(context, stored, {
      ...metadata,
      sourceState: "withdrawn",
    });
    await context.checks.set(stored.entity.id, { lastCheckedAt: now });
    return "withdrawn";
  }

  const { record, author } = source;
  // The byline is the author's own; a card that cannot be read keeps the last one.
  const byline = author ?? metadata.author;
  const seen =
    record.cid === state.cid &&
    byline === metadata.author &&
    metadata.sourceState === "active";
  if (!seen) {
    await writeMetadata(context, stored, {
      ...metadata,
      ...sourceFieldsOf(record, byline),
      sourceState: "active",
    });
  }
  if (!seen || state.failureCount !== undefined) {
    await context.checks.set(stored.entity.id, {
      cid: record.cid,
      author: byline,
      lastCheckedAt: now,
    });
  }
  return seen ? "unchanged" : "updated";
}

export interface RecheckResult {
  checked: number;
  updated: number;
  withdrawn: number;
  failed: number;
}

/**
 * The daily recheck: every reference against its record, and each author's
 * brain card read once. One site rebuild is asked for when a run withdraws
 * anything, so a withdrawn entry leaves the built site too. A failure to
 * reach an author changes nothing and is counted in the check's state.
 */
export async function recheckReferences(
  context: RecheckContext,
  signal: AbortSignal,
  now: string = new Date().toISOString(),
): Promise<RecheckResult> {
  const references: StoredReference[] = (
    await context.entityService.listEntities({
      entityType: "reference",
      options: { filter: { visibilityScope: allReferences } },
    })
  ).flatMap((entity) => {
    const metadata = referenceMetadataSchema.safeParse(entity.metadata);
    return metadata.success ? [{ entity, metadata: metadata.data }] : [];
  });

  // One open repo and one card read per author, shared by their entries.
  const authors = new Map<
    string,
    Promise<{ repo: PublicRepo; author: string | undefined }>
  >();
  const authorOf = (
    repoDid: string,
  ): Promise<{ repo: PublicRepo; author: string | undefined }> => {
    const known = authors.get(repoDid);
    if (known) return known;
    const opened = context.repos.open(repoDid).then(async (repo) => ({
      repo,
      author: await readAuthorName(repo).catch(() => undefined),
    }));
    authors.set(repoDid, opened);
    return opened;
  };

  const result: RecheckResult = {
    checked: 0,
    updated: 0,
    withdrawn: 0,
    failed: 0,
  };
  for (const stored of references) {
    signal.throwIfAborted();
    result.checked += 1;
    const state = (await context.checks.get(stored.entity.id)) ?? {};
    try {
      const { sourceUri } = stored.metadata;
      const repoDid = repoOf(sourceUri);
      const collection = collectionOf(sourceUri);
      const rkey = recordKeyOf(sourceUri);
      if (!repoDid || !collection || !rkey) {
        throw new Error(`${sourceUri} is not a record address`);
      }
      // No source when the record, or the author's whole account, is gone.
      const source = await authorOf(repoDid)
        .then(async ({ repo, author }): Promise<Source> => ({
          record: await repo.getRecord({ collection, rkey }),
          author,
        }))
        .catch((error: unknown) => {
          if (isSourceGone(error)) return undefined;
          throw error;
        });
      const outcome = await recheckOne(context, stored, source, state, now);
      if (outcome === "updated") result.updated += 1;
      if (outcome === "withdrawn") result.withdrawn += 1;
    } catch (error) {
      if (signal.aborted) throw error;
      result.failed += 1;
      await context.checks.set(stored.entity.id, {
        ...state,
        lastCheckedAt: now,
        lastError: getErrorMessage(error),
        failureCount: (state.failureCount ?? 0) + 1,
      });
    }
  }

  if (result.withdrawn > 0) {
    await context.requestRebuild(
      `${String(result.withdrawn)} referenced ${result.withdrawn === 1 ? "entity was" : "entities were"} withdrawn by their authors`,
    );
  }
  return result;
}
