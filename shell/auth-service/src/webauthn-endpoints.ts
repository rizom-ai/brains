import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { PasskeyService, WebAuthnRequestContext } from "./passkey-service";
import type { OperatorSessionStore } from "./session-store";
import type { SetupFlow } from "./setup-flow";
import { issuerFromRequest, isSecureRequest } from "./issuer";
import { jsonResponse, oauthErrorResponse } from "./http-responses";

export interface WebAuthnEndpointsOptions {
  passkeyService: PasskeyService;
  sessionStore: OperatorSessionStore;
  setupFlow: SetupFlow;
}

/**
 * WebAuthn HTTP endpoints: passkey registration (gated by the one-shot
 * setup token) and passkey authentication, both ending in an operator
 * session cookie.
 */
export class WebAuthnEndpoints {
  private readonly passkeyService: PasskeyService;
  private readonly sessionStore: OperatorSessionStore;
  private readonly setupFlow: SetupFlow;

  constructor(options: WebAuthnEndpointsOptions) {
    this.passkeyService = options.passkeyService;
    this.sessionStore = options.sessionStore;
    this.setupFlow = options.setupFlow;
  }

  async handleRegistrationOptions(request: Request): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!this.setupFlow.hasValidSetupToken(request)) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    const options = await this.passkeyService.generateRegistrationOptions(
      webAuthnRequestContext(request),
    );
    return jsonResponse(options);
  }

  async handleRegistrationVerify(request: Request): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!this.setupFlow.hasValidSetupToken(request)) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    const result = await this.passkeyService.verifyRegistrationResponse(
      (await request.json()) as RegistrationResponseJSON,
      webAuthnRequestContext(request),
    );
    if (!result.verified) {
      return oauthErrorResponse("access_denied", "Passkey registration failed");
    }

    await this.setupFlow.clearSetupState();
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
