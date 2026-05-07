import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import type { Logger } from "@brains/utils";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  PasskeyStore,
  type StoredPasskeyCredential,
} from "./passkey-store";

const DEFAULT_SUBJECT = "single-operator";
const DEFAULT_USER_NAME = "Operator";
const DEFAULT_RP_NAME = "Brain";

export interface PasskeyServiceOptions {
  storageDir: string;
  rpName?: string;
  logger?: Logger;
}

export interface WebAuthnRequestContext {
  origin: string;
  rpID: string;
}

export interface RegistrationVerifyResult {
  verified: boolean;
  subject?: string;
}

export interface AuthenticationVerifyResult {
  verified: boolean;
  subject?: string;
}

export class PasskeyService {
  private readonly store: PasskeyStore;
  private readonly rpName: string;
  private readonly logger: Logger | undefined;

  constructor(options: PasskeyServiceOptions) {
    this.store = new PasskeyStore({ storageDir: options.storageDir });
    this.rpName = options.rpName ?? DEFAULT_RP_NAME;
    this.logger = options.logger;
  }

  async hasCredentials(): Promise<boolean> {
    return this.store.hasCredentials();
  }

  async generateRegistrationOptions(
    context: WebAuthnRequestContext,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existingCredentials = await this.store.listCredentials();
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: context.rpID,
      userName: DEFAULT_USER_NAME,
      userDisplayName: DEFAULT_USER_NAME,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.id,
        ...(credential.transports ? { transports: credential.transports } : {}),
      })),
    });

    await this.store.saveRegistrationChallenge(
      options.challenge,
      DEFAULT_SUBJECT,
    );
    return options;
  }

  async verifyRegistrationResponse(
    response: RegistrationResponseJSON,
    context: WebAuthnRequestContext,
  ): Promise<RegistrationVerifyResult> {
    const challenge = response.response.clientDataJSON
      ? getChallengeFromClientData(response.response.clientDataJSON)
      : undefined;
    if (!challenge) {
      return { verified: false };
    }

    const storedChallenge =
      await this.store.consumeRegistrationChallenge(challenge);
    if (!storedChallenge) {
      return { verified: false };
    }

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      requireUserVerification: true,
    });

    if (!result.verified) {
      return { verified: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const credential = result.registrationInfo.credential;
    await this.store.addCredential({
      id: credential.id,
      public_key: bytesToBase64Url(credential.publicKey),
      counter: credential.counter,
      ...(credential.transports ? { transports: credential.transports } : {}),
      subject: storedChallenge.subject,
      user_name: DEFAULT_USER_NAME,
      credential_device_type: result.registrationInfo.credentialDeviceType,
      credential_backed_up: result.registrationInfo.credentialBackedUp,
      created_at: now,
      updated_at: now,
    });

    this.logger?.info("Registered passkey credential", {
      credentialId: credential.id,
    });
    return { verified: true, subject: storedChallenge.subject };
  }

  async generateAuthenticationOptions(
    context: WebAuthnRequestContext,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.store.listCredentials();
    const options = await generateAuthenticationOptions({
      rpID: context.rpID,
      userVerification: "required",
      allowCredentials: credentials.map((credential) => ({
        id: credential.id,
        ...(credential.transports ? { transports: credential.transports } : {}),
      })),
    });

    await this.store.saveAuthenticationChallenge(
      options.challenge,
      DEFAULT_SUBJECT,
    );
    return options;
  }

  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
    context: WebAuthnRequestContext,
  ): Promise<AuthenticationVerifyResult> {
    const challenge = response.response.clientDataJSON
      ? getChallengeFromClientData(response.response.clientDataJSON)
      : undefined;
    if (!challenge) {
      return { verified: false };
    }

    const storedChallenge =
      await this.store.consumeAuthenticationChallenge(challenge);
    if (!storedChallenge) {
      return { verified: false };
    }

    const credential = await this.store.getCredential(response.id);
    if (!credential) {
      return { verified: false };
    }

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      credential: toWebAuthnCredential(credential),
      requireUserVerification: true,
    });

    if (!result.verified) {
      return { verified: false };
    }

    await this.store.updateCredentialCounter(
      result.authenticationInfo.credentialID,
      result.authenticationInfo.newCounter,
    );
    return { verified: true, subject: credential.subject };
  }
}

function toWebAuthnCredential(
  credential: StoredPasskeyCredential,
): WebAuthnCredential {
  return {
    id: credential.id,
    publicKey: base64UrlToBytes(credential.public_key),
    counter: credential.counter,
    ...(credential.transports ? { transports: credential.transports } : {}),
  };
}

function getChallengeFromClientData(
  clientDataJSON: string,
): string | undefined {
  try {
    const json = JSON.parse(
      Buffer.from(clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: unknown };
    return typeof json.challenge === "string" ? json.challenge : undefined;
  } catch {
    return undefined;
  }
}
