import { z } from "@brains/utils/zod";

const limit = z.number().int().min(1).max(1000);
const seconds = z.number().int().min(1).max(86400);
/** The policy's fields and bounds; the schema adds the relation between them. */
export const formAdmissionPolicyShape: z.ZodObject<
  {
    windowSeconds: z.ZodNumber;
    globalRequests: z.ZodNumber;
    networkRequests: z.ZodNumber;
    globalForms: z.ZodNumber;
    networkForms: z.ZodNumber;
    globalSubmissions: z.ZodNumber;
    networkSubmissions: z.ZodNumber;
    tokenTtlSeconds: z.ZodNumber;
    receiptTtlSeconds: z.ZodNumber;
    maxEntries: z.ZodNumber;
  },
  z.core.$strict
> = z.strictObject({
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
});
export const formAdmissionPolicySchema: typeof formAdmissionPolicyShape =
  formAdmissionPolicyShape.refine(
    (value) =>
      value.networkRequests <= value.globalRequests &&
      value.networkForms <= value.globalForms &&
      value.networkSubmissions <= value.globalSubmissions,
    "Network limits must fit within global limits",
  );
export type FormAdmissionPolicy = z.output<typeof formAdmissionPolicySchema>;

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
type CountersSchema = z.ZodObject<
  { requests: z.ZodNumber; forms: z.ZodNumber; submissions: z.ZodNumber },
  z.core.$strict
>;
const counters: CountersSchema = z.strictObject({
  requests: integer.max(1000),
  forms: integer.max(1000),
  submissions: integer.max(1000),
});
type FormEntrySchema = z.ZodObject<
  {
    network: z.ZodString;
    expiresAt: z.ZodNumber;
    retainUntil: z.ZodNumber;
    submission: z.ZodOptional<
      z.ZodObject<
        { digest: z.ZodString; receivedAt: z.ZodNumber },
        z.core.$strict
      >
    >;
  },
  z.core.$strict
>;
const entry: FormEntrySchema = z.strictObject({
  network: digest,
  expiresAt: integer,
  retainUntil: integer,
  submission: z.strictObject({ digest, receivedAt: integer }).optional(),
});

export const formAdmissionStateSchema: z.ZodObject<
  {
    revision: z.ZodNumber;
    lastNow: z.ZodNumber;
    salt: z.ZodString;
    windowEnd: z.ZodNumber;
    global: CountersSchema;
    networks: z.ZodRecord<z.ZodString, CountersSchema>;
    entries: z.ZodRecord<z.ZodString, FormEntrySchema>;
  },
  z.core.$strict
> = z.strictObject({
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
export type FormAdmissionState = z.output<typeof formAdmissionStateSchema>;
