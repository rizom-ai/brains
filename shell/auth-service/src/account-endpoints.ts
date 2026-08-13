import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { AccountSettingsRegistry } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  AUTH_ACCOUNT_MUTATION_ACTIONS,
  type AuthAccountSnapshot,
} from "./account-contracts";
import type { AuthAccountContext, AuthAccountService } from "./account-service";
import { getErrorMessage } from "@brains/utils/error";
import {
  privateJsonResponse,
  readJsonRequest,
  requireSameOriginJson,
} from "./http-responses";
import { issuerFromRequest, isSecureRequest } from "./issuer";
import { AuthRouteTable, type AuthRoute } from "./route-table";
import { clearAuthSessionCookie } from "./session-store";

export interface AuthAccountOperations {
  resolveSession(request: Request): Promise<AuthAccountContext | undefined>;
  account: AuthAccountService;
  accountSettings?: AccountSettingsRegistry;
}

interface AccountRouteContext {
  account: AuthAccountContext;
  service: AuthAccountService;
  accountSettings?: AccountSettingsRegistry;
}

const accountMutationSchema = z.union([
  z.strictObject({
    action: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName),
    confirmation: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName),
    displayName: z.string().trim().min(1).max(200),
  }),
  z.strictObject({
    action: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey),
    confirmation: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey),
    credentialId: z.string().trim().min(1).max(2_000),
  }),
  z.strictObject({
    action: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession),
    confirmation: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession),
    sessionId: z.string().trim().min(1).max(200),
  }),
  z.strictObject({
    action: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions),
    confirmation: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions),
  }),
  z.strictObject({
    action: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions),
    confirmation: z.literal(AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions),
  }),
]);

const pluginSettingsMutationSchema = z.union([
  z.strictObject({
    action: z.literal("save"),
    definitionId: z.string().trim().min(1).max(1_000),
    values: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    action: z.literal("delete"),
    definitionId: z.string().trim().min(1).max(1_000),
  }),
]);

const emptyJsonSchema = z.strictObject({});

const accountRoutes = new AuthRouteTable<AccountRouteContext>([
  {
    method: "GET",
    path: "/auth/account",
    handler: async (_request, context): Promise<Response> =>
      privateJsonResponse({ account: await accountSnapshot(context) }),
  },
  {
    method: "POST",
    path: "/auth/account/mutations",
    handler: handleAccountMutation,
  },
  {
    method: "POST",
    path: "/auth/account/plugin-settings",
    handler: handlePluginSettingsMutation,
  },
  {
    method: "POST",
    path: "/auth/account/passkeys/options",
    handler: handlePasskeyOptions,
  },
  {
    method: "POST",
    path: "/auth/account/passkeys/verify",
    handler: handlePasskeyVerify,
  },
] satisfies AuthRoute<AccountRouteContext>[]);

export async function handleAuthAccountRequest(
  request: Request,
  operations: AuthAccountOperations,
): Promise<Response> {
  const account = await operations.resolveSession(request);
  if (!account) {
    return privateJsonResponse({ error: "Authentication required" }, 401);
  }

  try {
    return (
      (await accountRoutes.dispatch(request, {
        account,
        service: operations.account,
        ...(operations.accountSettings
          ? { accountSettings: operations.accountSettings }
          : {}),
      })) ?? privateJsonResponse({ error: "Not Found" }, 404)
    );
  } catch (error) {
    return privateJsonResponse(
      { error: getErrorMessage(error, "Account request failed") },
      400,
    );
  }
}

async function handleAccountMutation(
  request: Request,
  context: AccountRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;

  const parsed = accountMutationSchema.safeParse(
    await readJsonRequest(request),
  );
  if (!parsed.success) {
    return privateJsonResponse(
      { error: "Invalid or unconfirmed account mutation" },
      400,
    );
  }

  switch (parsed.data.action) {
    case "updateDisplayName":
      await context.service.updateDisplayName(
        context.account,
        parsed.data.displayName,
      );
      return accountResponse(await accountSnapshot(context));
    case "revokePasskey":
      await context.service.revokePasskey(
        context.account,
        parsed.data.credentialId,
      );
      return accountResponse(await accountSnapshot(context));
    case "revokeSession":
      await context.service.revokeSession(
        context.account,
        parsed.data.sessionId,
      );
      return accountResponse(await accountSnapshot(context));
    case "revokeOtherSessions": {
      const result = await context.service.revokeOtherSessions(context.account);
      return privateJsonResponse({
        account: await accountSnapshot(context),
        revoked: { sessions: result.sessions },
      });
    }
    case "revokeAllSessions": {
      const revoked = await context.service.revokeAllSessions(context.account);
      return withClearedSessionCookies(
        privateJsonResponse({ revoked, signedOut: true }),
        request,
      );
    }
  }
}

async function handlePluginSettingsMutation(
  request: Request,
  context: AccountRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;
  if (!context.accountSettings) {
    return privateJsonResponse(
      { error: "Account settings runtime is unavailable" },
      503,
    );
  }
  const parsed = pluginSettingsMutationSchema.safeParse(
    await readJsonRequest(request),
  );
  if (!parsed.success) {
    return privateJsonResponse(
      { error: "Invalid account settings request" },
      400,
    );
  }
  if (parsed.data.action === "save") {
    await context.accountSettings.save(
      parsed.data.definitionId,
      context.account.userId,
      parsed.data.values,
    );
  } else {
    await context.accountSettings.delete(
      parsed.data.definitionId,
      context.account.userId,
    );
  }
  return accountResponse(await accountSnapshot(context));
}

async function accountSnapshot(
  context: AccountRouteContext,
): Promise<AuthAccountSnapshot> {
  const account = await context.service.getSnapshot(context.account);
  const pluginSettings = context.accountSettings
    ? await context.accountSettings.listForms(context.account.userId)
    : [];
  return { ...account, pluginSettings: [...pluginSettings] };
}

async function handlePasskeyOptions(
  request: Request,
  context: AccountRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;
  if (!emptyJsonSchema.safeParse(await readJsonRequest(request)).success) {
    return privateJsonResponse({ error: "Invalid passkey request" }, 400);
  }

  return privateJsonResponse(
    await context.service.generatePasskeyRegistrationOptions(
      context.account,
      webAuthnRequestContext(request),
    ),
  );
}

async function handlePasskeyVerify(
  request: Request,
  context: AccountRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;
  const response = await readJsonRequest(request);
  if (!isRegistrationResponseJSON(response)) {
    return privateJsonResponse({ error: "Invalid passkey response" }, 400);
  }

  const verified = await context.service.verifyPasskeyRegistration(
    context.account,
    response,
    webAuthnRequestContext(request),
  );
  if (!verified) {
    return privateJsonResponse({ error: "Passkey registration failed" }, 400);
  }
  return privateJsonResponse({
    verified: true,
    account: await accountSnapshot(context),
  });
}

function accountResponse(account: AuthAccountSnapshot): Response {
  return privateJsonResponse({ account });
}

function withClearedSessionCookies(
  response: Response,
  request: Request,
): Response {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    clearAuthSessionCookie(isSecureRequest(request)),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function webAuthnRequestContext(request: Request): {
  origin: string;
  rpID: string;
} {
  const issuer = new URL(issuerFromRequest(request));
  return { origin: issuer.origin, rpID: issuer.hostname };
}

const registrationResponseKeys = new Set([
  "id",
  "rawId",
  "response",
  "authenticatorAttachment",
  "clientExtensionResults",
  "type",
]);
const attestationResponseKeys = new Set([
  "clientDataJSON",
  "attestationObject",
  "authenticatorData",
  "transports",
  "publicKeyAlgorithm",
  "publicKey",
]);
const authenticatorTransports = new Set([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

function isRegistrationResponseJSON(
  value: unknown,
): value is RegistrationResponseJSON {
  if (typeof value !== "object" || value === null) return false;
  if (Object.keys(value).some((key) => !registrationResponseKeys.has(key))) {
    return false;
  }
  if (!("id" in value) || typeof value.id !== "string") return false;
  if (!("rawId" in value) || typeof value.rawId !== "string") return false;
  if (!("type" in value) || value.type !== "public-key") return false;
  if (
    !("clientExtensionResults" in value) ||
    typeof value.clientExtensionResults !== "object" ||
    value.clientExtensionResults === null
  ) {
    return false;
  }
  if (
    "authenticatorAttachment" in value &&
    value.authenticatorAttachment !== "platform" &&
    value.authenticatorAttachment !== "cross-platform"
  ) {
    return false;
  }
  if (!("response" in value)) return false;
  const response = value.response;
  if (typeof response !== "object" || response === null) return false;
  if (Object.keys(response).some((key) => !attestationResponseKeys.has(key))) {
    return false;
  }
  if (
    !("clientDataJSON" in response) ||
    typeof response.clientDataJSON !== "string" ||
    !("attestationObject" in response) ||
    typeof response.attestationObject !== "string"
  ) {
    return false;
  }
  if (
    "transports" in response &&
    (!Array.isArray(response.transports) ||
      !response.transports.every(
        (transport) =>
          typeof transport === "string" &&
          authenticatorTransports.has(transport),
      ))
  ) {
    return false;
  }
  if (
    "authenticatorData" in response &&
    typeof response.authenticatorData !== "string"
  ) {
    return false;
  }
  if ("publicKey" in response && typeof response.publicKey !== "string") {
    return false;
  }
  return (
    !("publicKeyAlgorithm" in response) ||
    typeof response.publicKeyAlgorithm === "number"
  );
}
