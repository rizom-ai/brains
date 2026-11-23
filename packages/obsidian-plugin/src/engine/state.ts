import { z } from "@brains/utils/zod";

type PathStateSchema = z.ZodObject<{
  etag: z.ZodString;
  hash: z.ZodString;
  size: z.ZodOptional<z.ZodNumber>;
  mtime: z.ZodOptional<z.ZodNumber>;
}>;

const pathStateSchema: PathStateSchema = z.object({
  /** The brain's version when the vault and the brain last agreed. */
  etag: z.string().min(1),
  /** The hash of the vault's file at that moment. */
  hash: z.string().min(1),
  /** The file's size and modification time then, to skip hashing it again. */
  size: z.number().optional(),
  mtime: z.number().optional(),
});

export type PathState = z.output<PathStateSchema>;

type SyncStateSchema = z.ZodObject<{
  initialized: z.ZodDefault<z.ZodBoolean>;
  address: z.ZodDefault<z.ZodString>;
  typeFolders: z.ZodDefault<z.ZodArray<z.ZodString>>;
  paths: z.ZodDefault<z.ZodRecord<z.ZodString, PathStateSchema>>;
  renames: z.ZodDefault<
    z.ZodArray<z.ZodObject<{ from: z.ZodString; to: z.ZodString }>>
  >;
  deletes: z.ZodDefault<z.ZodArray<z.ZodString>>;
  generated: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
  templateFolderSet: z.ZodDefault<z.ZodBoolean>;
}>;

export const syncStateSchema: SyncStateSchema = z.object({
  /** Whether the first sync of this vault was confirmed and made. */
  initialized: z.boolean().default(false),
  /** The brain's address the state belongs to. */
  address: z.string().default(""),
  /** The entity types the drive listed last: the vault's type folders. */
  typeFolders: z.array(z.string()).default([]),
  paths: z.record(z.string(), pathStateSchema).default({}),
  /** Renames made in the vault, waiting to be made in the brain, in order. */
  renames: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  /** Files the person deleted in the vault, waiting to be deleted in the brain. */
  deletes: z.array(z.string()).default([]),
  /** The templates, fileClasses and bases the plugin wrote, by path, each with the hash of what it wrote. */
  generated: z.record(z.string(), z.string()).default({}),
  /** Whether Obsidian's Templates was pointed at the brain's templates; done once. */
  templateFolderSet: z.boolean().default(false),
});

export type SyncState = z.output<SyncStateSchema>;

/** A fresh state: nothing synced yet. */
export function emptyState(address = ""): SyncState {
  return {
    initialized: false,
    address,
    typeFolders: [],
    paths: {},
    renames: [],
    deletes: [],
    generated: {},
    templateFolderSet: false,
  };
}

/** A stored state, or a fresh one when what is stored cannot be read. */
export function parseState(value: unknown): SyncState {
  const parsed = syncStateSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : emptyState();
}

/** Where the plugin keeps its state between runs. */
export interface StateStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}

/** State held in memory, for the tests. */
export function memoryStateStore(initial?: SyncState): StateStore & {
  current: SyncState;
} {
  const store = {
    current: initial ?? emptyState(),
    load: async (): Promise<SyncState> => structuredClone(store.current),
    save: async (state: SyncState): Promise<void> => {
      store.current = structuredClone(state);
    },
  };
  return store;
}
