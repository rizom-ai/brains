import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { AuthService } from "../src/auth-service";
import type { AuthAdministration } from "../src/administration";
import type {
  AuthAudit,
  AuthCaller,
  AuthFederation,
} from "../src/capabilities";

/**
 * The administration contract is the measured surface `@brains/admin` calls,
 * published deliberately instead of the plugin reaching for the whole class.
 *
 * Two nets. The type-level assignment fails compilation if AuthService stops
 * satisfying the contract — `implements` on the class makes the break name
 * the class, this makes it name the consumer's view. The prototype walk fails
 * at runtime if a contract method never existed at all, which a structural
 * assignment cannot see when the class gains an unrelated overload.
 */

const CONTRACT_METHODS = [
  "resolveSession",
  "listUsers",
  "listAdminUsers",
  "getBrainAnchor",
  "updateUserRole",
  "updateUserStatus",
  "deleteSuspendedUser",
  "revokeUserSessionsAndRefreshTokens",
  "createInvitation",
  "cancelInvitation",
  "resendInvitation",
  "confirmManualInvitationDelivery",
  "listInvitationChannels",
  "inviteExternalPeerPerson",
  "linkExternalPeer",
  "unlinkExternalPeer",
  "attachIdentity",
  "detachIdentity",
  "revokePasskey",
  "startPasskeyRegistrationForUser",
  "recordAuditEvent",
  "queryAuditEvents",
] as const satisfies readonly (keyof AuthAdministration & keyof AuthService)[];

describe("auth administration contract", () => {
  it("is satisfied by AuthService", () => {
    // Type-only: no instance is constructed. If the class and the contract
    // drift apart, this line stops compiling.
    const conforms = (service: AuthService): AuthAdministration => service;
    expect(typeof conforms).toBe("function");
  });

  it("names only methods AuthService actually has", () => {
    for (const method of CONTRACT_METHODS) {
      expect(typeof AuthService.prototype[method]).toBe("function");
    }
  });

  it("covers every method the contract declares", () => {
    // The contract is keyof-checked against the list above, so adding a
    // method to the interface without adding it here stops compiling too.
    // Compile-time: any contract method missing from the list above leaves
    // `Uncovered` non-never, and this declaration stops compiling.
    type Uncovered = Exclude<
      keyof AuthAdministration,
      (typeof CONTRACT_METHODS)[number]
    >;
    const noneUncovered: [Uncovered] extends [never] ? true : never = true;
    expect(noneUncovered).toBe(true);
  });
});

describe("auth capability contracts", () => {
  it("hands author callbacks bound capability views, not the live auth service", async () => {
    const storageDir = await mkdtemp(
      join(tmpdir(), "auth-authoring-capabilities-"),
    );
    const service = new AuthService({
      storageDir,
      issuer: "https://brain.example.com",
      autoStartInvitationDeliveryRecovery: false,
    });
    const harness = createPluginHarness();
    try {
      await service.initialize();
      const user = await service.createUser({
        displayName: "Reader",
        role: "trusted",
        status: "active",
      });
      const registry = harness.getMockShell().getAuthRegistry();
      let assertions = 0;
      const definition = defineServicePlugin(
        {
          id: "auth-reader",
          config: z.object({}),
          setup: async ({ auth }) => {
            expect(auth.getCaller()).toBeUndefined();
            registry.register(service);
            const caller = auth.getCaller();
            const audit = auth.getAudit();
            const federation = auth.getFederation();
            const identities = auth.getIdentities();
            const admin = auth.getAdministration();
            if (!caller || !audit || !federation || !identities || !admin)
              throw new Error("Auth views missing");
            const views = [
              {
                view: caller,
                methods: [
                  "resolveSession",
                  "resolveBearerGrant",
                  "createAuthLoginResponse",
                ],
              },
              {
                view: audit,
                methods: ["recordAuditEvent", "queryAuditEvents"],
              },
              {
                view: federation,
                methods: [
                  "getIssuer",
                  "getA2APeerTrust",
                  "getA2ASigningKey",
                  "grantA2APeerTrust",
                  "revokeA2APeerTrust",
                ],
              },
              { view: identities, methods: ["resolveIdentityAccess"] },
              { view: admin, methods: [...CONTRACT_METHODS] },
            ];
            for (const { view, methods } of views) {
              expect(Object.keys(view).sort()).toEqual(methods.sort());
              expect(Object.isFrozen(view)).toBe(true);
              expect(view).not.toHaveProperty("runtime");
              expect(view).not.toHaveProperty("requestRouter");
              expect(view).not.toHaveProperty("close");
              expect(view).not.toBeInstanceOf(AuthService);
              expect(Reflect.set(view, "runtime", {})).toBe(false);
            }
            const { getIssuer } = federation;
            expect(getIssuer()).toBe("https://brain.example.com");
            const { resolveSession } = caller;
            expect(
              await resolveSession(new Request("https://brain.example.com/")),
            ).toBeUndefined();
            const missingAnchor = await admin.getBrainAnchor().then(
              () => undefined,
              (error: unknown) => error,
            );
            expect(missingAnchor).toMatchObject({ code: "not_found" });
            const { listUsers } = admin;
            expect(await listUsers()).toContainEqual(
              expect.objectContaining({ userId: user.userId }),
            );
            const { recordAuditEvent, queryAuditEvents } = audit;
            const event = await recordAuditEvent({
              action: "capability.checked",
            });
            expect(
              (await queryAuditEvents({ offset: 0, limit: 10 })).events,
            ).toContainEqual(event);
            const { resolveIdentityAccess } = identities;
            expect(
              await resolveIdentityAccess({
                type: "email",
                subject: "unbound@example.com",
              }),
            ).toEqual({ state: "unbound" });
            registry.unregister(service);
            expect([
              auth.getCaller(),
              auth.getAudit(),
              auth.getFederation(),
              auth.getIdentities(),
              auth.getAdministration(),
            ]).toEqual([undefined, undefined, undefined, undefined, undefined]);
            registry.register(service);
            expect(auth.getFederation()?.getIssuer()).toBe(
              "https://brain.example.com",
            );
            assertions++;
            return {};
          },
        },
        {},
      );
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/auth-reader", version: "0.1.0" },
      );
      if (!plugin) throw new Error("Auth reader plugin missing");
      await harness.installPlugin(plugin);
      expect(assertions).toBe(1);
    } finally {
      try {
        await harness.reset();
      } finally {
        await service.close();
        await rm(storageDir, { recursive: true, force: true });
      }
    }
  });

  it("are satisfied by AuthService", () => {
    // Type-only: if the class and any capability drift apart, these stop
    // compiling.
    const asCaller = (service: AuthService): AuthCaller => service;
    const asAudit = (service: AuthService): AuthAudit => service;
    const asFederation = (service: AuthService): AuthFederation => service;
    expect(typeof asCaller).toBe("function");
    expect(typeof asAudit).toBe("function");
    expect(typeof asFederation).toBe("function");
  });

  it("give administration the same audit surface studio writes through", () => {
    // AuthAdministration extends AuthAudit, so the two consumers of audit
    // share one definition rather than drifting copies.
    const widen = (admin: AuthAdministration): AuthAudit => admin;
    expect(typeof widen).toBe("function");
  });
});
