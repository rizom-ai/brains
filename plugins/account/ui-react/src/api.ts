import type {
  AuthAccountMutation,
  AuthAccountResponse,
  AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";

export interface AccountMutationResponse {
  account?: AuthAccountSnapshot;
  revoked?: { sessions: number; refreshTokens?: number };
  signedOut?: boolean;
}

interface RegistrationOptionsJSON {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: Array<
    Omit<PublicKeyCredentialDescriptor, "id"> & { id: string }
  >;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
}

export class AccountApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Account request failed";
    throw new AccountApiError(error, response.status);
  }
  return body as T;
}

export async function fetchAccount(): Promise<AuthAccountSnapshot> {
  const response = await parseResponse<AuthAccountResponse>(
    await fetch("/auth/account", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
  return response.account;
}

export async function mutateAccount(
  mutation: AuthAccountMutation,
): Promise<AccountMutationResponse> {
  return parseResponse(
    await fetch("/auth/account/mutations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    }),
  );
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    .buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function prepareCreationOptions(
  options: RegistrationOptionsJSON,
): PublicKeyCredentialCreationOptions {
  return {
    challenge: decodeBase64Url(options.challenge),
    rp: options.rp,
    user: { ...options.user, id: decodeBase64Url(options.user.id) },
    pubKeyCredParams: options.pubKeyCredParams,
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options.excludeCredentials
      ? {
          excludeCredentials: options.excludeCredentials.map((credential) => ({
            ...credential,
            id: decodeBase64Url(credential.id),
          })),
        }
      : {}),
    ...(options.authenticatorSelection
      ? { authenticatorSelection: options.authenticatorSelection }
      : {}),
    ...(options.attestation ? { attestation: options.attestation } : {}),
    ...(options.extensions ? { extensions: options.extensions } : {}),
  };
}

export async function registerPasskey(): Promise<AuthAccountSnapshot> {
  const options = await parseResponse<RegistrationOptionsJSON>(
    await fetch("/auth/account/passkeys/options", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  const created = await navigator.credentials.create({
    publicKey: prepareCreationOptions(options),
  });
  if (!(created instanceof PublicKeyCredential)) {
    throw new Error("Passkey registration was cancelled");
  }
  if (!(created.response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Authenticator returned an invalid passkey response");
  }
  const response = created.response;
  const payload = {
    id: created.id,
    rawId: encodeBase64Url(created.rawId),
    type: created.type,
    ...(created.authenticatorAttachment
      ? { authenticatorAttachment: created.authenticatorAttachment }
      : {}),
    clientExtensionResults: created.getClientExtensionResults(),
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      attestationObject: encodeBase64Url(response.attestationObject),
      transports:
        typeof response.getTransports === "function"
          ? response.getTransports()
          : [],
    },
  };
  const result = await parseResponse<AuthAccountResponse & { verified: true }>(
    await fetch("/auth/account/passkeys/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return result.account;
}
