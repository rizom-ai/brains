import { z } from "@brains/utils/zod";
import {
  contactAdmissionPolicySchema,
  contactAdmissionPolicyShape,
  type ContactAdmissionPolicy,
} from "./admission-state";
import {
  contactHttpPolicySchema,
  contactHttpPolicyShape,
  type ContactHttpPolicy,
} from "./http";
import {
  contactStoragePolicySchema,
  contactStoragePolicyShape,
  type ContactStoragePolicy,
} from "./storage-slots";
import {
  contactDeliveryPolicySchema,
  contactDeliveryPolicyShape,
  type ContactDeliveryPolicy,
} from "./delivery";

/** The intake's policy as it runs: the plugin's defaults under the owner's
 * overrides, on the origin the brain serves. */
export interface ContactIntakePolicy {
  http: ContactHttpPolicy;
  admission: ContactAdmissionPolicy;
  storage: ContactStoragePolicy;
  delivery: ContactDeliveryPolicy;
}

/** What the intake runs on unless the owner says otherwise. A deployment
 * serves through a proxy or a CDN, so the "network" the plugin sees is the
 * proxy's and every visitor shares it: the network limits equal the global
 * ones, and requests and forms take their bound's maximum, so honest traffic
 * is never refused; a hundred submissions an hour, half-hour form tokens,
 * notes kept for a day, and a few alert attempts within the transport's
 * idempotency window. The brain supplies the origin. */
export const CONTACT_INTAKE_DEFAULTS: {
  http: Omit<ContactHttpPolicy, "origin" | "trustForwardedProto">;
  admission: ContactAdmissionPolicy;
  storage: ContactStoragePolicy;
  delivery: ContactDeliveryPolicy;
} = {
  http: { maxBodyBytes: 20000, readTimeoutMs: 10000 },
  admission: {
    windowSeconds: 3600,
    globalRequests: 1000,
    networkRequests: 1000,
    globalForms: 1000,
    networkForms: 1000,
    globalSubmissions: 100,
    networkSubmissions: 100,
    tokenTtlSeconds: 1800,
    receiptTtlSeconds: 600,
    maxEntries: 1000,
  },
  storage: { retentionSeconds: 86400, maxRecords: 50, maxBytes: 500000 },
  delivery: { maxAttempts: 3, retryWindowSeconds: 3600 },
};

/** Configuration is only for a value the owner wants different. The origin,
 * the preview host and the Inbox destination are the brain's own, never
 * configured. */
type Overridable<T> = { [K in keyof T]?: T[K] | undefined };
export interface ContactIntakeOverrides {
  http?:
    | Overridable<Omit<ContactHttpPolicy, "origin" | "trustForwardedProto">>
    | undefined;
  admission?: Overridable<ContactAdmissionPolicy> | undefined;
  storage?: Overridable<ContactStoragePolicy> | undefined;
  delivery?: Overridable<ContactDeliveryPolicy> | undefined;
}
const intakeOverridesSchema: z.ZodType<
  ContactIntakeOverrides,
  ContactIntakeOverrides
> = z.strictObject({
  http: contactHttpPolicyShape
    .omit({ origin: true, trustForwardedProto: true })
    .partial()
    .optional(),
  admission: contactAdmissionPolicyShape.partial().optional(),
  storage: contactStoragePolicyShape.partial().optional(),
  delivery: contactDeliveryPolicyShape.partial().optional(),
});
export interface ContactPluginConfig {
  intake?: ContactIntakeOverrides | undefined;
}
export const contactPluginConfigSchema: z.ZodType<
  ContactPluginConfig,
  ContactPluginConfig
> = z.strictObject({ intake: intakeOverridesSchema.optional() });

/** The policy the intake runs on the given origin: defaults under the
 * overrides, each held to its bounds. Behind a TLS-terminating proxy, which is
 * how an HTTPS origin is served, the proxy's protocol is believed. */
export function resolveIntakePolicy(
  config: ContactPluginConfig,
  origin: string,
): ContactIntakePolicy {
  const overrides: ContactIntakeOverrides = config.intake ?? {};
  const https = new URL(origin).protocol === "https:";
  return {
    http: contactHttpPolicySchema.parse({
      origin,
      ...(https ? { trustForwardedProto: true } : {}),
      ...CONTACT_INTAKE_DEFAULTS.http,
      ...overrides.http,
    }),
    admission: contactAdmissionPolicySchema.parse({
      ...CONTACT_INTAKE_DEFAULTS.admission,
      ...overrides.admission,
    }),
    storage: contactStoragePolicySchema.parse({
      ...CONTACT_INTAKE_DEFAULTS.storage,
      ...overrides.storage,
    }),
    delivery: contactDeliveryPolicySchema.parse({
      ...CONTACT_INTAKE_DEFAULTS.delivery,
      ...overrides.delivery,
    }),
  };
}
