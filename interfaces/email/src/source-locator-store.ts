import type { IRuntimeStateStore } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { InboundEmailSelection } from "./inbound-email";

const DEFAULT_MAX_LOCATORS = 20_000;
const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

const emailSourceRefSchema: z.ZodString = z
  .string()
  .regex(/^imap:[a-f0-9]{64}$/);

export const emailSourceLocatorSchema: z.ZodObject<
  {
    sourceRef: z.ZodString;
    mailbox: z.ZodString;
    uidValidity: z.ZodString;
    uid: z.ZodNumber;
    recordedAt: z.ZodISODateTime;
  },
  z.core.$strict
> = z.strictObject({
  sourceRef: emailSourceRefSchema,
  mailbox: z.string().min(1).max(1_000),
  uidValidity: z.string().regex(/^[1-9]\d*$/),
  uid: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
});

export type EmailSourceLocator = z.output<typeof emailSourceLocatorSchema>;

export class EmailSourceLocatorStore {
  private readonly store: IRuntimeStateStore<EmailSourceLocator>;
  private readonly now: () => Date;
  private readonly maxLocators: number;
  private readonly retentionMs: number;

  constructor(
    store: IRuntimeStateStore<EmailSourceLocator>,
    options: {
      now?: (() => Date) | undefined;
      maxLocators?: number | undefined;
      retentionMs?: number | undefined;
    } = {},
  ) {
    this.store = store;
    this.now = options.now ?? ((): Date => new Date());
    this.maxLocators = options.maxLocators ?? DEFAULT_MAX_LOCATORS;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  }

  async record(
    sourceRef: string,
    selection: InboundEmailSelection,
    uid: number,
  ): Promise<void> {
    const now = this.now();
    const locator = emailSourceLocatorSchema.parse({
      sourceRef,
      ...selection,
      uid,
      recordedAt: now.toISOString(),
    });
    const existing = await this.store.get(sourceRef);
    if (existing && this.isExpired(existing, now)) {
      await this.store.delete(sourceRef);
    }
    await this.store.setIfNotExists(sourceRef, locator);
  }

  async resolve(sourceRef: string): Promise<EmailSourceLocator | undefined> {
    const parsedRef = emailSourceRefSchema.parse(sourceRef);
    const locator = (await this.store.get(parsedRef)) ?? undefined;
    if (locator && this.isExpired(locator, this.now())) {
      await this.store.delete(parsedRef);
      return undefined;
    }
    return locator;
  }

  async prune(): Promise<void> {
    const records = await this.store.list();
    const expiresBefore = this.now().getTime() - this.retentionMs;
    const expired = records.filter(
      (record) => Date.parse(record.value.recordedAt) < expiresBefore,
    );
    const expiredKeys = new Set(expired.map((record) => record.key));
    const retained = records
      .filter((record) => !expiredKeys.has(record.key))
      .sort(
        (left, right) =>
          left.value.recordedAt.localeCompare(right.value.recordedAt) ||
          left.key.localeCompare(right.key),
      );
    const overflow = Math.max(0, retained.length - this.maxLocators);
    const keys = [
      ...expiredKeys,
      ...retained.slice(0, overflow).map((record) => record.key),
    ];
    await Promise.all(keys.map(async (key) => this.store.delete(key)));
  }

  private isExpired(locator: EmailSourceLocator, now: Date): boolean {
    return Date.parse(locator.recordedAt) < now.getTime() - this.retentionMs;
  }
}
