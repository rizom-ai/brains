import type { ClassRuntimeState } from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";

/**
 * The hidden folders the drive keeps for a person instead of forgetting
 * them. Obsidian holds a vault's settings, open tabs and plugins in
 * `.obsidian` at the vault's root, and a vault that lost them every ten
 * minutes would not be one. Everything else hidden stays temporary: a
 * desktop's `.Trashes` and `.DS_Store` are housekeeping nobody misses.
 */
const KEPT_ROOTS: ReadonlySet<string> = new Set([".obsidian"]);

/** The most one person's kept folders hold: settings and a set of plugins. */
export const KEPT_CAP_BYTES: number = 32 * 1024 * 1024;

/** Whether a path lies in a folder the drive keeps for the person. */
export function isKeptPath(segments: string[]): boolean {
  const [root] = segments;
  return root !== undefined && KEPT_ROOTS.has(root);
}

/** One kept file or folder, by its path below the drive's root. */
export interface KeptEntry {
  path: string;
  /** Absent for a folder. */
  bytes?: Uint8Array<ArrayBuffer> | undefined;
  /** Milliseconds since the epoch. */
  modified: number;
}

/**
 * Where kept folders outlive the process, per person. The drive holds them
 * in memory while it runs and writes each change through.
 */
export interface KeptStore {
  load(userId: string): Promise<KeptEntry[]>;
  put(userId: string, entry: KeptEntry): Promise<void>;
  remove(userId: string, paths: string[]): Promise<void>;
}

/** Kept folders held in memory: a drive served on its own, as tests do. */
export function memoryKeptStore(): KeptStore {
  const people = new Map<string, Map<string, KeptEntry>>();
  const of = (userId: string): Map<string, KeptEntry> => {
    const entries = people.get(userId) ?? new Map<string, KeptEntry>();
    people.set(userId, entries);
    return entries;
  };
  return {
    load: async (userId) => [...of(userId).values()],
    put: async (userId, entry): Promise<void> => {
      of(userId).set(entry.path, entry);
    },
    remove: async (userId, paths): Promise<void> => {
      paths.forEach((path) => of(userId).delete(path));
    },
  };
}

const NAMESPACE = "webdav.kept";
const storedSchema: z.ZodObject<{
  path: z.ZodString;
  bytes: z.ZodOptional<z.ZodString>;
  modified: z.ZodNumber;
}> = z.object({
  path: z.string().min(1),
  /** Base64; absent for a folder. */
  bytes: z.string().optional(),
  modified: z.number(),
});

/** Kept folders in runtime-state, which outlives a restart. */
export function runtimeStateKeptStore(
  runtimeState: ClassRuntimeState,
): KeptStore {
  const store = runtimeState.scoped({
    namespace: NAMESPACE,
    schema: storedSchema,
  });
  // A person's entries share a key prefix; a path can be any length.
  const prefix = (userId: string): string => `${computeContentHash(userId)}/`;
  const key = (userId: string, path: string): string =>
    `${prefix(userId)}${computeContentHash(path)}`;
  return {
    load: async (userId) =>
      (await store.list({ keyPrefix: prefix(userId) })).map(({ value }) => ({
        path: value.path,
        modified: value.modified,
        ...(value.bytes !== undefined && {
          bytes: new Uint8Array(Buffer.from(value.bytes, "base64")),
        }),
      })),
    put: async (userId, entry): Promise<void> => {
      await store.set(key(userId, entry.path), {
        path: entry.path,
        modified: entry.modified,
        ...(entry.bytes !== undefined && {
          bytes: Buffer.from(entry.bytes).toString("base64"),
        }),
      });
    },
    remove: async (userId, paths): Promise<void> => {
      await Promise.all(paths.map((path) => store.delete(key(userId, path))));
    },
  };
}
