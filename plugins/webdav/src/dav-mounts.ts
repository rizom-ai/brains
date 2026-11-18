import type { ClassRuntimeState } from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";

/**
 * What one mount last held of one file. A mount is an app password: two
 * computers of one person are two mounts, each with its own view.
 */
export interface MountBase {
  /** The content hash of the version the mount read or saved. */
  hash: string;
  /** The hash of a losing save already kept as a conflict from this base. */
  conflictEdit?: string | undefined;
}

/**
 * The versions mounts hold, which is what a save that names no version is
 * based on. Set when a mount reads a file and when its own save is stored,
 * never by a listing. It outlives a restart, and an entry not used for
 * thirty days is forgotten.
 */
export interface MountBases {
  get(mount: string, path: string): Promise<MountBase | undefined>;
  /** The mount read this version, or saved it. */
  held(mount: string, path: string, hash: string): Promise<void>;
  /** A save from the mount's base lost, and is kept as a conflict. */
  conflictKept(mount: string, path: string, edit: string): Promise<void>;
  forget(mount: string, path: string): Promise<void>;
  /** Forget every entry not used for thirty days. */
  sweep(): Promise<void>;
}

export const MOUNT_BASE_TTL_MS: number = 30 * 24 * 60 * 60 * 1000;

interface Stored extends MountBase {
  usedAt: number;
}

const keyOf = (mount: string, path: string): string =>
  computeContentHash(`${mount}\n${path}`);

/** Mount bases over any keyed store, aged by the given clock. */
function mountBases(
  store: {
    get(key: string): Promise<Stored | undefined>;
    set(key: string, value: Stored): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<Array<{ key: string; value: Stored }>>;
  },
  now: () => number,
): MountBases {
  const fresh = (entry: Stored | undefined): entry is Stored =>
    entry !== undefined && now() - entry.usedAt < MOUNT_BASE_TTL_MS;
  return {
    get: async (mount, path): Promise<MountBase | undefined> => {
      const entry = await store.get(keyOf(mount, path));
      return fresh(entry)
        ? {
            hash: entry.hash,
            ...(entry.conflictEdit !== undefined && {
              conflictEdit: entry.conflictEdit,
            }),
          }
        : undefined;
    },
    held: async (mount, path, hash): Promise<void> => {
      await store.set(keyOf(mount, path), { hash, usedAt: now() });
    },
    conflictKept: async (mount, path, edit): Promise<void> => {
      const entry = await store.get(keyOf(mount, path));
      if (!fresh(entry)) return;
      await store.set(keyOf(mount, path), {
        hash: entry.hash,
        conflictEdit: edit,
        usedAt: now(),
      });
    },
    forget: async (mount, path): Promise<void> => {
      await store.delete(keyOf(mount, path));
    },
    sweep: async (): Promise<void> => {
      const stale = (await store.keys()).filter(({ value }) => !fresh(value));
      await Promise.all(stale.map(({ key }) => store.delete(key)));
    },
  };
}

/** Mount bases held in memory: a drive served on its own, as tests do. */
export function memoryMountBases(now: () => number = Date.now): MountBases {
  const entries = new Map<string, Stored>();
  return mountBases(
    {
      get: async (key) => entries.get(key),
      set: async (key, value): Promise<void> => {
        entries.set(key, value);
      },
      delete: async (key): Promise<void> => {
        entries.delete(key);
      },
      keys: async () => [...entries].map(([key, value]) => ({ key, value })),
    },
    now,
  );
}

const NAMESPACE = "webdav.mount-base";
const storedSchema: z.ZodObject<{
  hash: z.ZodString;
  conflictEdit: z.ZodOptional<z.ZodString>;
  usedAt: z.ZodNumber;
}> = z.object({
  hash: z.string().min(1),
  conflictEdit: z.string().min(1).optional(),
  usedAt: z.number(),
});

/** Mount bases in runtime-state, which outlives a restart. */
export function runtimeStateMountBases(
  runtimeState: ClassRuntimeState,
  now: () => number = Date.now,
): MountBases {
  const store = runtimeState.scoped({
    namespace: NAMESPACE,
    schema: storedSchema,
  });
  return mountBases(
    {
      get: async (key) => (await store.get(key)) ?? undefined,
      set: async (key, value): Promise<void> => {
        await store.set(key, value);
      },
      delete: async (key): Promise<void> => {
        await store.delete(key);
      },
      keys: () => store.list(),
    },
    now,
  );
}
