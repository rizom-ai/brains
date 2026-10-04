import { describe, expect, it } from "bun:test";
import {
  CONTACT_INTAKE_DEFAULTS,
  contactPluginConfigSchema,
  resolveIntakePolicy,
} from "../src/config";

// Convention over configuration: a brain that loads the plugin gets a working
// intake on the plugin's own policy, with its origin taken from the brain.
// Configuration is only for a value the owner wants different.

describe("contact intake configuration", () => {
  it("needs nothing: the plugin's own policy applies", () => {
    expect(contactPluginConfigSchema.parse({})).toEqual({});
    expect(contactPluginConfigSchema.parse({ intake: {} })).toEqual({
      intake: {},
    });
    expect(resolveIntakePolicy({}, "https://brain.test")).toEqual({
      http: {
        origin: "https://brain.test",
        trustForwardedProto: true,
        ...CONTACT_INTAKE_DEFAULTS.http,
      },
      admission: CONTACT_INTAKE_DEFAULTS.admission,
      storage: CONTACT_INTAKE_DEFAULTS.storage,
      delivery: CONTACT_INTAKE_DEFAULTS.delivery,
    });
  });

  it("keeps the rest of a policy when one value is overridden", () => {
    const policy = resolveIntakePolicy(
      { intake: { storage: { retentionSeconds: 7 * 86400 } } },
      "https://brain.test",
    );
    expect(policy.storage).toEqual({
      ...CONTACT_INTAKE_DEFAULTS.storage,
      retentionSeconds: 7 * 86400,
    });
    expect(policy.admission).toEqual(CONTACT_INTAKE_DEFAULTS.admission);
  });

  it("holds an override to the policy's bounds", () => {
    expect(() =>
      resolveIntakePolicy(
        { intake: { storage: { retentionSeconds: 60 } } },
        "https://brain.test",
      ),
    ).toThrow();
    expect(() =>
      contactPluginConfigSchema.parse({
        intake: { admission: { globalRequests: "many" } },
      }),
    ).toThrow();
  });

  it("refuses what it derives from the brain itself", () => {
    for (const intake of [
      { http: { origin: "https://other.test" } },
      {
        inboxUrl: "https://brain.test/studio/workspaces/unified-inbox%3Ainbox",
      },
      { preview: true },
    ])
      expect(() => contactPluginConfigSchema.parse({ intake })).toThrow();
  });

  it("believes a TLS-terminating proxy only for an HTTPS origin", () => {
    expect(
      resolveIntakePolicy({}, "http://localhost:8080").http.trustForwardedProto,
    ).toBeUndefined();
    expect(
      resolveIntakePolicy({}, "https://brain.test").http.trustForwardedProto,
    ).toBe(true);
  });
});

describe("the admission defaults behind a proxy", () => {
  // A deployment serves through a TLS-terminating proxy or a CDN, so the
  // "network" the plugin sees is the proxy's: every visitor shares it. The
  // network limits therefore equal the global ones, and requests and forms
  // take the bound's maximum, so honest traffic is never refused.
  it("never refuse honest visitors who share the proxy's network", () => {
    const { admission } = CONTACT_INTAKE_DEFAULTS;
    expect(admission.networkRequests).toBe(admission.globalRequests);
    expect(admission.networkForms).toBe(admission.globalForms);
    expect(admission.networkSubmissions).toBe(admission.globalSubmissions);
    expect(admission.globalRequests).toBe(1000);
    expect(admission.globalForms).toBe(1000);
    expect(admission.maxEntries).toBe(1000);
  });
});
