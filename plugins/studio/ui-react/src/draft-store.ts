import { z } from "@brains/utils/zod";

/** How long an unsaved draft is kept in this browser. */
export const DRAFT_RETENTION_MS: number = 7 * 24 * 60 * 60 * 1000;

const PREFIX = "studio.draft.";

/** An unsaved draft as this browser keeps it. */
const storedDraftSchema: z.ZodObject<{
  draft: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  body: z.ZodString;
  baseContentHash: z.ZodOptional<z.ZodString>;
  savedAt: z.ZodNumber;
}> = z.object({
  draft: z.record(z.string(), z.unknown()),
  body: z.string(),
  baseContentHash: z.string().optional(),
  savedAt: z.number(),
});

export type StoredDraft = z.output<typeof storedDraftSchema>;

/**
 * Where one person's unsaved draft of one entry is kept. Storage is already
 * per brain (each brain is its own origin); the person keeps two people who
 * share a browser apart.
 */
export function draftKey(principalId: string, documentKey: string): string {
  return `${PREFIX}${principalId}.${documentKey}`;
}

/** Keep a draft, leaving out every field that holds a credential. */
export function keepDraft(
  storage: Storage,
  key: string,
  input: StoredDraft & { secretFields: readonly string[] },
): void {
  const { secretFields, ...draft } = input;
  const record: StoredDraft = {
    ...draft,
    draft: Object.fromEntries(
      Object.entries(draft.draft).filter(
        ([name]) => !secretFields.includes(name),
      ),
    ),
  };
  storage.setItem(key, JSON.stringify(storedDraftSchema.parse(record)));
}

/** The draft kept for this entry, unless it is older than a week or unreadable. */
export function recoverDraft(
  storage: Storage,
  key: string,
  now: number,
): StoredDraft | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const parsed = storedDraftSchema.safeParse(parseJson(raw));
  if (!parsed.success || now - parsed.data.savedAt > DRAFT_RETENTION_MS) {
    storage.removeItem(key);
    return null;
  }
  return parsed.data;
}

export function forgetDraft(storage: Storage, key: string): void {
  storage.removeItem(key);
}

/** Forget every draft one person kept in this browser, as at logout. */
export function clearDrafts(storage: Storage, principalId: string): void {
  const own = `${PREFIX}${principalId}.`;
  Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key?.startsWith(own) === true)
    .forEach((key) => storage.removeItem(key));
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // An unreadable record is treated as no draft and removed by the caller.
    return undefined;
  }
}
