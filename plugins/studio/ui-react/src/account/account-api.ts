import type {
  AuthAccountMutation,
  AuthAccountPluginSettingsMutation,
  AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";
import { z } from "@brains/utils/zod";
import { isRecord } from "@brains/utils/is-record";

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

const rawAccountSnapshotSchema = z.object({
  displayName: z.string(),
  role: z.enum(["admin", "trusted", "public"]),
  profileEntityId: z.string().optional(),
  passkeys: z.array(
    z.object({
      id: z.string(),
      transports: z.array(z.string()).optional(),
      credentialDeviceType: z.string().optional(),
      credentialBackedUp: z.boolean(),
      createdAt: z.number(),
      updatedAt: z.number(),
    }),
  ),
  connectedChannels: z.array(
    z.object({
      type: z.string(),
      label: z.string(),
      verifiedAt: z.number(),
    }),
  ),
  pluginSettings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      configured: z.boolean(),
      revision: z.number().nullable(),
      fields: z.array(
        z.object({
          name: z.string(),
          label: z.string(),
          control: z.enum(["text", "url", "number", "checkbox"]),
          secret: z.boolean(),
          required: z.boolean(),
          value: z
            .union([z.string(), z.number(), z.boolean(), z.null()])
            .optional(),
          set: z.boolean().optional(),
        }),
      ),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      current: z.boolean(),
      createdAt: z.number(),
      expiresAt: z.number(),
    }),
  ),
});

function isAccountSnapshot(value: unknown): value is AuthAccountSnapshot {
  return rawAccountSnapshotSchema.safeParse(value).success;
}

const accountSnapshotSchema = z.custom<AuthAccountSnapshot>(isAccountSnapshot, {
  message: "Invalid account response",
});
const accountResponseSchema = z.object({
  account: accountSnapshotSchema,
});

const rawAccountMutationResponseSchema = z.object({
  account: accountSnapshotSchema.optional(),
  revoked: z
    .object({
      sessions: z.number(),
      refreshTokens: z.number().optional(),
    })
    .optional(),
  signedOut: z.boolean().optional(),
});

function isAccountMutationResponse(
  value: unknown,
): value is AccountMutationResponse {
  return rawAccountMutationResponseSchema.safeParse(value).success;
}

const accountMutationResponseSchema = z.custom<AccountMutationResponse>(
  isAccountMutationResponse,
  { message: "Invalid account mutation response" },
);

const registrationOptionsSchema = z.custom<RegistrationOptionsJSON>(
  (value) => {
    if (!isRecord(value)) return false;
    return (
      typeof value["challenge"] === "string" &&
      isRecord(value["rp"]) &&
      isRecord(value["user"]) &&
      Array.isArray(value["pubKeyCredParams"])
    );
  },
  { message: "Invalid passkey registration options" },
);

export class AccountApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
  }
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
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
  return schema.parse(body);
}

export async function fetchAccount(): Promise<AuthAccountSnapshot> {
  const response = await parseResponse(
    await fetch("/auth/account", {
      credentials: "same-origin",
      cache: "no-store",
    }),
    accountResponseSchema,
  );
  return response.account;
}

export async function mutatePluginSettings(
  mutation: AuthAccountPluginSettingsMutation,
): Promise<AuthAccountSnapshot> {
  const response = await parseResponse(
    await fetch("/auth/account/plugin-settings", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    }),
    accountResponseSchema,
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
    accountMutationResponseSchema,
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
  const options = await parseResponse(
    await fetch("/auth/account/passkeys/options", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    registrationOptionsSchema,
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
  const result = await parseResponse(
    await fetch("/auth/account/passkeys/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    accountResponseSchema.extend({ verified: z.literal(true) }),
  );
  return result.account;
}
