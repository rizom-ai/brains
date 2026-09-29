import { z } from "@brains/utils/zod";

export interface ContactAdmissionPolicy {
  windowSeconds: number;
  globalRequests: number;
  networkRequests: number;
  globalForms: number;
  networkForms: number;
  globalSubmissions: number;
  networkSubmissions: number;
  tokenTtlSeconds: number;
  receiptTtlSeconds: number;
  maxEntries: number;
}

const limit = z.number().int().min(1).max(1000);
const seconds = z.number().int().min(1).max(86400);
export const contactAdmissionPolicySchema: z.ZodType<ContactAdmissionPolicy> = z
  .strictObject({
    windowSeconds: seconds,
    globalRequests: limit,
    networkRequests: limit,
    globalForms: limit,
    networkForms: limit,
    globalSubmissions: limit,
    networkSubmissions: limit,
    tokenTtlSeconds: seconds,
    receiptTtlSeconds: seconds,
    maxEntries: limit,
  })
  .refine(
    (value) =>
      value.networkRequests <= value.globalRequests &&
      value.networkForms <= value.globalForms &&
      value.networkSubmissions <= value.globalSubmissions,
    "Network limits must fit within global limits",
  );

interface Counters {
  requests: number;
  forms: number;
  submissions: number;
}
interface FormEntry {
  network: string;
  expiresAt: number;
  retainUntil: number;
  submission?: { digest: string; receivedAt: number } | undefined;
}
export interface ContactAdmissionState {
  revision: number;
  lastNow: number;
  salt: string;
  windowEnd: number;
  global: Counters;
  networks: Record<string, Counters>;
  entries: Record<string, FormEntry>;
}

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const counters = z.strictObject({
  requests: integer.max(1000),
  forms: integer.max(1000),
  submissions: integer.max(1000),
});
const entry = z.strictObject({
  network: digest,
  expiresAt: integer,
  retainUntil: integer,
  submission: z.strictObject({ digest, receivedAt: integer }).optional(),
});

export const contactAdmissionStateSchema: z.ZodType<ContactAdmissionState> =
  z.strictObject({
    revision: integer,
    lastNow: integer,
    salt: digest,
    windowEnd: integer,
    global: counters,
    networks: z
      .record(digest, counters)
      .refine((value) => Object.keys(value).length <= 1000),
    entries: z
      .record(digest, entry)
      .refine((value) => Object.keys(value).length <= 1000),
  });
