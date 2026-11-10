import { z } from "@brains/utils/zod";
import {
  formAdmissionPolicySchema,
  formAdmissionPolicyShape,
  type FormAdmissionPolicy,
} from "./admission-state";
import {
  formDeliveryPolicySchema,
  formDeliveryPolicyShape,
  type FormDeliveryPolicy,
} from "./delivery";
import {
  formHttpPolicySchema,
  formHttpPolicyShape,
  type FormHttpPolicy,
} from "./http";

/** The engine's policy as it runs: defaults under the owner's overrides, on
 * the origin the brain serves. */
export interface FormEnginePolicy {
  http: FormHttpPolicy;
  admission: FormAdmissionPolicy;
  delivery: FormDeliveryPolicy;
}

/** What a form runs on unless the owner says otherwise. A deployment
 * serves through a proxy or a CDN, so the "network" the plugin sees is the
 * proxy's and every visitor shares it: the network limits equal the global
 * ones, and requests and forms take their bound's maximum, so honest traffic
 * is never refused; a hundred submissions an hour, half-hour form tokens,
 * and a few alert attempts within the transport's idempotency window.
 * Submissions are kept until the owner deletes them. The brain supplies the
 * origin. */
export const FORM_POLICY_DEFAULTS: {
  http: Omit<FormHttpPolicy, "origin" | "trustForwardedProto">;
  admission: FormAdmissionPolicy;
  delivery: FormDeliveryPolicy;
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
  delivery: { maxAttempts: 3, retryWindowSeconds: 3600 },
};

/** Configuration is only for a value the owner wants different. The origin,
 * the preview host and the Inbox destination are the brain's own, never
 * configured. */
type Overridable<T> = { [K in keyof T]?: T[K] | undefined };
export interface FormPolicyOverrides {
  http?:
    | Overridable<Omit<FormHttpPolicy, "origin" | "trustForwardedProto">>
    | undefined;
  admission?: Overridable<FormAdmissionPolicy> | undefined;
  delivery?: Overridable<FormDeliveryPolicy> | undefined;
}
export const formPolicyOverridesSchema: z.ZodType<FormPolicyOverrides> =
  z.strictObject({
    http: formHttpPolicyShape
      .omit({ origin: true, trustForwardedProto: true })
      .partial()
      .optional(),
    admission: formAdmissionPolicyShape.partial().optional(),
    delivery: formDeliveryPolicyShape.partial().optional(),
  });

/** The policy forms run on the given origin: defaults under the overrides,
 * each held to its bounds. Behind a TLS-terminating proxy, which is how an
 * HTTPS origin is served, the proxy's protocol is believed. */
export function resolveFormPolicy(
  overrides: FormPolicyOverrides,
  origin: string,
): FormEnginePolicy {
  const https = new URL(origin).protocol === "https:";
  return {
    http: formHttpPolicySchema.parse({
      origin,
      ...(https ? { trustForwardedProto: true } : {}),
      ...FORM_POLICY_DEFAULTS.http,
      ...overrides.http,
    }),
    admission: formAdmissionPolicySchema.parse({
      ...FORM_POLICY_DEFAULTS.admission,
      ...overrides.admission,
    }),
    delivery: formDeliveryPolicySchema.parse({
      ...FORM_POLICY_DEFAULTS.delivery,
      ...overrides.delivery,
    }),
  };
}
