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
        }),
        consumeSetupToken: async () => undefined,
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
      completeTargetedRegistration: async (userId: string): Promise<void> => {
        calls.push(`complete:${userId}`);
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
    expect(calls).toEqual(["complete:usr_invited", "session:usr_invited"]);
  });
});
