import { describe, expect, it } from "bun:test";
import type { CreateAuthSessionResult } from "../src/session-store";
import {
  WebAuthnEndpoints,
  type EndpointPasskeys,
  type EndpointSessions,
  type EndpointSetupFlow,
} from "../src/webauthn-endpoints";

/**
 * Well-formed credential envelopes.
 *
 * The endpoints validate the posted body before handing it to the passkey
 * service, so these tests — which exercise session binding and audit
 * behaviour, not credential parsing — must post something a browser could
 * actually have produced.
 */
const registrationCredential = JSON.stringify({
  id: "cred-id",
  rawId: "cred-id",
  type: "public-key",
  clientExtensionResults: {},
  response: {
    clientDataJSON: "client-data",
    attestationObject: "attestation",
  },
});

const authenticationCredential = JSON.stringify({
  id: "cred-id",
  rawId: "cred-id",
  type: "public-key",
  clientExtensionResults: {},
  response: {
    clientDataJSON: "client-data",
    authenticatorData: "auth-data",
    signature: "signature",
  },
});

/**
 * A passkey surface for one flow.
 *
 * Each test drives a single endpoint, so it supplies the two or three
 * methods that flow calls. The rest throw rather than being quietly absent:
 * if an endpoint ever starts calling one, the test says so instead of
 * passing on a stub that returned undefined.
 */
function passkeys(overrides: Partial<EndpointPasskeys>): EndpointPasskeys {
  const unexpected = (name: string) => (): never => {
    throw new Error(name + " was not expected in this flow");
  };
  return {
    hasCredentials: unexpected("hasCredentials"),
    generateRegistrationOptions: unexpected("generateRegistrationOptions"),
    verifyRegistrationResponse: unexpected("verifyRegistrationResponse"),
    generateAuthenticationOptions: unexpected("generateAuthenticationOptions"),
    verifyAuthenticationResponse: unexpected("verifyAuthenticationResponse"),
    ...overrides,
  };
}

/**
 * A setup-flow surface for one flow, for the same reason as {@link passkeys}:
 * each test supplies what its endpoint calls, and the rest throw if reached.
 */
function setup(overrides: Partial<EndpointSetupFlow>): EndpointSetupFlow {
  const unexpected = (name: string) => (): never => {
    throw new Error(name + " was not expected in this flow");
  };
  return {
    resolveSetupToken: unexpected("resolveSetupToken"),
    hasConflictingAccountSession: unexpected("hasConflictingAccountSession"),
    consumeSetupToken: unexpected("consumeSetupToken"),
    ...overrides,
  };
}

describe("WebAuthnEndpoints", () => {
  it("completes targeted invited-user registration before creating a session", async () => {
    const calls: string[] = [];
    const endpoints = new WebAuthnEndpoints({
      passkeyService: passkeys({
        hasCredentials: async () => true,
        verifyRegistrationResponse: async () => ({
          verified: true,
          subject: "usr_invited",
        }),
      }),
      sessionStore: {
        createSession: async (
          subject: string,
        ): Promise<CreateAuthSessionResult> => {
          calls.push(`session:${subject}`);
          return {
            subject,
            cookie: "brains_auth_session=session-token",
            expiresAt: Date.now() + 60_000,
          };
        },
      } satisfies EndpointSessions,
      setupFlow: setup({
        resolveSetupToken: async () => ({
          token: "setup-token",
          targetUserId: "usr_invited",
          deliveryClaimId: "aid_email",
        }),
        hasConflictingAccountSession: async () => false,
        consumeSetupToken: async () => {
          calls.push("consume");
        },
      }),
      registrationUserProvider: async (): Promise<{
        subject: string;
        userName: string;
        userDisplayName: string;
      }> => ({
        subject: "usr_invited",
        userName: "Mira",
        userDisplayName: "Mira",
      }),
      validateTargetedRegistration: async (setup): Promise<void> => {
        calls.push(`validate:${setup.targetUserId}:${setup.deliveryClaimId}`);
      },
      completeTargetedRegistration: async (setup): Promise<void> => {
        calls.push(`complete:${setup.targetUserId}:${setup.deliveryClaimId}`);
      },
    });

    const response = await endpoints.handleRegistrationVerify(
      new Request(
        "https://brain.example.com/webauthn/register/verify?setup_token=setup-token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: registrationCredential,
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "validate:usr_invited:aid_email",
      "complete:usr_invited:aid_email",
      "session:usr_invited",
    ]);
  });

  it("rejects a suspended or mismatched delivery before persisting a passkey", async () => {
    const calls: string[] = [];
    const endpoints = new WebAuthnEndpoints({
      passkeyService: passkeys({
        hasCredentials: async () => true,
        verifyRegistrationResponse: async () => {
          calls.push("verify");
          return { verified: true, subject: "usr_invited" };
        },
      }),
      sessionStore: {
        createSession: async (): Promise<CreateAuthSessionResult> => ({
          subject: "usr_invited",
          cookie: "brains_auth_session=session-token",
          expiresAt: Date.now() + 60_000,
        }),
      } satisfies EndpointSessions,
      setupFlow: setup({
        resolveSetupToken: async () => ({
          token: "setup-token",
          targetUserId: "usr_invited",
          deliveryClaimId: "aid_wrong_person",
        }),
        hasConflictingAccountSession: async () => false,
      }),
      registrationUserProvider: async (): Promise<{
        subject: string;
        userName: string;
        userDisplayName: string;
      }> => ({
        subject: "usr_invited",
        userName: "Mira",
        userDisplayName: "Mira",
      }),
      validateTargetedRegistration: async (): Promise<never> => {
        calls.push("validate");
        throw new Error("Passkey registration user is unavailable");
      },
      completeTargetedRegistration: async (): Promise<void> => {
        calls.push("complete");
      },
      recordAuditEvent: async (event): Promise<void> => {
        calls.push(`audit:${event.action}:${event.targetId}`);
      },
    });

    const response = await endpoints.handleRegistrationVerify(
      new Request(
        "https://brain.example.com/webauthn/register/verify?setup_token=setup-token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: registrationCredential,
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "access_denied",
      error_description: "Passkey registration user is unavailable",
    });
    expect(calls).toEqual([
      "validate",
      "audit:auth.passkey.registration_failed:usr_invited",
    ]);
  });

  it("binds the authenticated session to the verified passkey subject", async () => {
    const calls: string[] = [];
    const endpoints = new WebAuthnEndpoints({
      passkeyService: passkeys({
        hasCredentials: async () => true,
        verifyAuthenticationResponse: async () => ({
          verified: true,
          subject: "usr_member",
        }),
      }),
      sessionStore: {
        createSession: async (
          subject: string,
        ): Promise<CreateAuthSessionResult> => {
          calls.push(`session:${subject}`);
          return {
            subject,
            cookie: "brains_auth_session=session-token",
            expiresAt: Date.now() + 60_000,
          };
        },
      } satisfies EndpointSessions,
      setupFlow: setup({}),
      registrationUserProvider: async (): Promise<{
        subject: string;
        userName: string;
        userDisplayName: string;
      }> => ({
        subject: "usr_member",
        userName: "Mira",
        userDisplayName: "Mira",
      }),
      validateTargetedRegistration: async (): Promise<void> => {},
      completeTargetedRegistration: async (): Promise<void> => {},
    });

    const response = await endpoints.handleAuthenticationVerify(
      new Request("https://brain.example.com/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: authenticationCredential,
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["session:usr_member"]);
  });
});
