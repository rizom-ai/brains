import { describe, expect, it } from "bun:test";
import type { PasskeyService } from "../src/passkey-service";
import type { AuthSessionPersistence } from "../src/session-store";
import type { SetupFlow } from "../src/setup-flow";
import { WebAuthnEndpoints } from "../src/webauthn-endpoints";

describe("WebAuthnEndpoints", () => {
  it("completes targeted invited-user registration before creating a session", async () => {
    const calls: string[] = [];
    const endpoints = new WebAuthnEndpoints({
      passkeyService: {
        hasCredentials: async () => true,
        verifyRegistrationResponse: async () => ({
          verified: true,
          subject: "usr_invited",
        }),
      } as unknown as PasskeyService,
      sessionStore: {
        createSession: async (subject: string) => {
          calls.push(`session:${subject}`);
          return {
            token: "session-token",
            cookie: "brains_auth_session=session-token",
            record: {
              tokenHash: "hash",
              subject,
              expiresAt: Date.now() + 60_000,
              createdAt: Date.now(),
            },
          };
        },
      } as unknown as AuthSessionPersistence,
      setupFlow: {
        resolveSetupToken: async () => ({
          token: "setup-token",
          targetUserId: "usr_invited",
          deliveryClaimId: "aid_email",
        }),
        hasConflictingAccountSession: async () => false,
        consumeSetupToken: async () => {
          calls.push("consume");
        },
      } as unknown as SetupFlow,
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
          body: "{}",
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
      passkeyService: {
        hasCredentials: async () => true,
        verifyRegistrationResponse: async () => {
          calls.push("verify");
          return { verified: true, subject: "usr_invited" };
        },
      } as unknown as PasskeyService,
      sessionStore: {
        createSession: async () => {
          calls.push("session");
          throw new Error("Session creation must not run");
        },
      } as unknown as AuthSessionPersistence,
      setupFlow: {
        resolveSetupToken: async () => ({
          token: "setup-token",
          targetUserId: "usr_invited",
          deliveryClaimId: "aid_wrong_person",
        }),
        hasConflictingAccountSession: async () => false,
      } as unknown as SetupFlow,
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
          body: "{}",
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
});
