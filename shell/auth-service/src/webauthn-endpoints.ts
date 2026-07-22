import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type {
  PasskeyRegistrationUser,
  PasskeyService,
  WebAuthnRequestContext,
} from "./passkey-service";
import type { AuthSessionPersistence } from "./session-store";
import type { ResolvedSetupToken, SetupFlow } from "./setup-flow";
import { issuerFromRequest, isSecureRequest } from "./issuer";
import { jsonResponse, oauthErrorResponse } from "./http-responses";

export interface WebAuthnEndpointsOptions {
  passkeyService: PasskeyService;
  sessionStore: AuthSessionPersistence;
  setupFlow: SetupFlow;
  registrationUserProvider: (
    userId?: string,
  ) => Promise<PasskeyRegistrationUser>;
  validateTargetedRegistration?: (
    setup: ResolvedSetupToken & { targetUserId: string },
  ) => Promise<void>;
  completeTargetedRegistration?: (
    setup: ResolvedSetupToken & { targetUserId: string },
  ) => Promise<void>;
  recordAuditEvent?: (event: {
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

/**
 * WebAuthn HTTP endpoints: passkey registration (gated by the one-shot
 * setup token) and passkey authentication, both ending in an authenticated
 * session cookie.
 */
export class WebAuthnEndpoints {
  private readonly passkeyService: PasskeyService;
  private readonly sessionStore: AuthSessionPersistence;
  private readonly setupFlow: SetupFlow;
  private readonly registrationUserProvider: (
    userId?: string,
  ) => Promise<PasskeyRegistrationUser>;
  private readonly validateTargetedRegistration:
    | ((setup: ResolvedSetupToken & { targetUserId: string }) => Promise<void>)
    | undefined;
  private readonly completeTargetedRegistration:
    | ((setup: ResolvedSetupToken & { targetUserId: string }) => Promise<void>)
    | undefined;
  private readonly recordAuditEvent:
    | ((event: {
        action: string;
        targetType?: string;
        targetId?: string;
        metadata?: Record<string, unknown>;
      }) => Promise<void>)
    | undefined;

  constructor(options: WebAuthnEndpointsOptions) {
    this.passkeyService = options.passkeyService;
    this.sessionStore = options.sessionStore;
    this.setupFlow = options.setupFlow;
    this.registrationUserProvider = options.registrationUserProvider;
    this.validateTargetedRegistration = options.validateTargetedRegistration;
    this.completeTargetedRegistration = options.completeTargetedRegistration;
    this.recordAuditEvent = options.recordAuditEvent;
  }

  async handleRegistrationOptions(request: Request): Promise<Response> {
    const setup = await this.setupFlow.resolveSetupToken(request);
    if (
      (await this.passkeyService.hasCredentials()) &&
      setup?.targetUserId == null
    ) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!setup) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    try {
      const options = await this.passkeyService.generateRegistrationOptions(
        webAuthnRequestContext(request),
        await this.registrationUserProvider(setup.targetUserId ?? undefined),
      );
      return jsonResponse(options);
    } catch {
      return oauthErrorResponse(
        "access_denied",
        "Passkey registration user is unavailable",
      );
    }
  }

  async handleRegistrationVerify(request: Request): Promise<Response> {
    const setup = await this.setupFlow.resolveSetupToken(request);
    if (
      (await this.passkeyService.hasCredentials()) &&
      setup?.targetUserId == null
    ) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!setup) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    if (setup.targetUserId) {
      try {
        await this.registrationUserProvider(setup.targetUserId);
        await this.validateTargetedRegistration?.({
          ...setup,
          targetUserId: setup.targetUserId,
        });
      } catch {
        await this.recordRegistrationFailure(setup.targetUserId);
        return oauthErrorResponse(
          "access_denied",
          "Passkey registration user is unavailable",
        );
      }
    }

    const result = await this.passkeyService.verifyRegistrationResponse(
      (await request.json()) as RegistrationResponseJSON,
      webAuthnRequestContext(request),
      setup.targetUserId ?? undefined,
    );
    if (
      !result.verified ||
      (setup.targetUserId !== null && result.subject !== setup.targetUserId)
    ) {
      await this.recordRegistrationFailure(setup.targetUserId);
      return oauthErrorResponse("access_denied", "Passkey registration failed");
    }

    if (setup.targetUserId && this.completeTargetedRegistration) {
      try {
        await this.completeTargetedRegistration({
          ...setup,
          targetUserId: setup.targetUserId,
        });
      } catch {
        await this.recordRegistrationFailure(setup.targetUserId);
        return oauthErrorResponse(
          "access_denied",
          "Passkey registration user is unavailable",
        );
      }
    } else {
      await this.setupFlow.consumeSetupToken(setup.token);
    }
    const session = await this.sessionStore.createSession(
      result.subject ?? "single-operator",
      { secure: isSecureRequest(request) },
    );
    return jsonResponse({ verified: true }, 200, {
      "Set-Cookie": session.cookie,
    });
  }

  private async recordRegistrationFailure(
    targetUserId: string | null,
  ): Promise<void> {
    await this.recordAuditEvent?.({
      action: "auth.passkey.registration_failed",
      ...(targetUserId ? { targetType: "user", targetId: targetUserId } : {}),
    });
  }

  async handleAuthenticationOptions(request: Request): Promise<Response> {
    if (!(await this.passkeyService.hasCredentials())) {
      return oauthErrorResponse("access_denied", "No passkey registered");
    }

    const options = await this.passkeyService.generateAuthenticationOptions(
      webAuthnRequestContext(request),
    );
    return jsonResponse(options);
  }

  async handleAuthenticationVerify(request: Request): Promise<Response> {
    const result = await this.passkeyService.verifyAuthenticationResponse(
      (await request.json()) as AuthenticationResponseJSON,
      webAuthnRequestContext(request),
    );
    if (!result.verified) {
      await this.recordAuditEvent?.({
        action: "auth.passkey.authentication_failed",
      });
      return oauthErrorResponse(
        "access_denied",
        "Passkey authentication failed",
      );
    }

    const session = await this.sessionStore.createSession(
      result.subject ?? "single-operator",
      { secure: isSecureRequest(request) },
    );
    return jsonResponse({ verified: true }, 200, {
      "Set-Cookie": session.cookie,
    });
  }
}

function webAuthnRequestContext(request: Request): WebAuthnRequestContext {
  const issuer = issuerFromRequest(request);
  const origin = new URL(issuer);
  return {
    origin: origin.origin,
    rpID: origin.hostname,
  };
}
