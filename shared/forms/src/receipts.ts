import { createHash, randomBytes } from "node:crypto";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { FormResult } from "./score";

const MAX_RECEIPTS = 1000;
const resultSchema = z.strictObject({
  dimension: z.string().max(64),
  outcome: z.string().max(64),
});
const receiptsSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  receipts: z
    .record(
      z.string().regex(/^[a-f0-9]{64}$/),
      z.strictObject({
        expiresAt: z.number().int().nonnegative(),
        results: z.array(resultSchema).max(20),
      }),
    )
    .refine((receipts) => Object.keys(receipts).length <= MAX_RECEIPTS),
});
type Receipts = z.output<typeof receiptsSchema>;

function digest(receipt: string): string {
  return createHash("sha256").update(receipt).digest("hex");
}

/**
 * What the thanks page after a scored submission shows it: an opaque
 * receipt in the redirect, standing for that submission's results until it
 * expires. Only its hash is kept, and nothing the visitor submitted.
 */
export class FormReceipts {
  private readonly store: IRuntimeStateStore<Receipts>;
  private readonly ttlSeconds: number;
  private readonly now: () => number;
  constructor(
    state: IRuntimeStateNamespace,
    namespace: string,
    ttlSeconds: number,
    now: () => number = Date.now,
  ) {
    this.store = state.scoped({ namespace, schema: receiptsSchema });
    this.ttlSeconds = ttlSeconds;
    this.now = now;
  }

  async issue(results: FormResult[], attempts = 16): Promise<string> {
    if (attempts === 0) throw new Error("Form receipt unavailable");
    const now = this.now();
    const stored = (await this.store.get("receipts")) ?? null;
    if (!stored) {
      await this.store.setIfNotExists("receipts", {
        revision: 0,
        receipts: {},
      });
      return this.issue(results, attempts - 1);
    }
    const receipt = randomBytes(32).toString("hex");
    // The oldest go first when the store is full; an expired one never stays.
    const kept = Object.entries(stored.receipts)
      .filter(([, entry]) => entry.expiresAt > now)
      .sort(([, a], [, b]) => b.expiresAt - a.expiresAt)
      .slice(0, MAX_RECEIPTS - 1);
    const written = await this.store.compareAndSet("receipts", stored, {
      revision: stored.revision + 1,
      receipts: {
        ...Object.fromEntries(kept),
        [digest(receipt)]: {
          expiresAt: now + this.ttlSeconds * 1000,
          results,
        },
      },
    });
    return written ? receipt : this.issue(results, attempts - 1);
  }

  /** The results a receipt stands for, or nothing once it has expired. */
  async read(receipt: string): Promise<FormResult[] | null> {
    if (!/^[a-f0-9]{64}$/.test(receipt)) return null;
    const entry = (await this.store.get("receipts"))?.receipts[digest(receipt)];
    return entry && entry.expiresAt > this.now() ? entry.results : null;
  }
}
