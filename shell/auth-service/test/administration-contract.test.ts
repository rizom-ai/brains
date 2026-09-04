import { describe, expect, it } from "bun:test";
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
