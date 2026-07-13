import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type {
  PasskeyRegistrationUser,
  PasskeyService,
  WebAuthnRequestContext,
} from "./passkey-service";
import type { OperatorSessionPersistence } from "./session-store";
import type { SetupFlow } from "./setup-flow";
import { issuerFromRequest, isSecureRequest } from "./issuer";
import { jsonResponse, oauthErrorResponse } from "./http-responses";

export interface WebAuthnEndpointsOptions {
  passkeyService: PasskeyService;
  sessionStore: OperatorSessionPersistence;
  setupFlow: SetupFlow;
  registrationUserProvider: (
    userId?: string,
  ) => Promise<PasskeyRegistrationUser>;
  recordAuditEvent?: (event: {
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

/**
 * WebAuthn HTTP endpoints: passkey registration (gated by the one-shot
 * setup token) and passkey authentication, both ending in an operator
 * session cookie.
 */
export class WebAuthnEndpoints {
  private readonly passkeyService: PasskeyService;
  private readonly sessionStore: OperatorSessionPersistence;
  private readonly setupFlow: SetupFlow;
  private readonly registrationUserProvider: (
    userId?: string,
  ) => Promise<PasskeyRegistrationUser>;
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

    const result = await this.passkeyService.verifyRegistrationResponse(
      (await request.json()) as RegistrationResponseJSON,
      webAuthnRequestContext(request),
      setup.targetUserId ?? undefined,
    );
    if (!result.verified) {
      await this.recordAuditEvent?.({
        action: "auth.passkey.registration_failed",
        ...(setup.targetUserId
          ? { targetType: "user", targetId: setup.targetUserId }
          : {}),
      });
      return oauthErrorResponse("access_denied", "Passkey registration failed");
    }

    await this.setupFlow.consumeSetupToken(setup.token);
    const session = await this.sessionStore.createSession(
      result.subject ?? "single-operator",
      { secure: isSecureRequest(request) },
    );
    return jsonResponse({ verified: true }, 200, {
      "Set-Cookie": session.cookie,
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
