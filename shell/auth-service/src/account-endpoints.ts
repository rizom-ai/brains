import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "@brains/utils/zod";
import {
  AUTH_ACCOUNT_MUTATION_ACTIONS,
  type AuthAccountSnapshot,
} from "./account-contracts";
import type { AuthAccountContext, AuthAccountService } from "./account-service";
import {
  errorMessage,
  htmlResponse,
  privateJsonResponse,
  readJsonRequest,
  requireSameOriginJson,
} from "./http-responses";
import { issuerFromRequest, isSecureRequest } from "./issuer";
import { renderAccountPage } from "./account-page";
import { AuthRouteTable, type AuthRoute } from "./route-table";
import { clearAuthSessionCookies } from "./session-store";

export interface AuthAccountOperations {
  resolveSession(request: Request): Promise<AuthAccountContext | undefined>;
  account: AuthAccountService;
}

interface AccountRouteContext {
  account: AuthAccountContext;
  service: AuthAccountService;
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

const emptyJsonSchema = z.strictObject({});

const accountRoutes = new AuthRouteTable<AccountRouteContext>([
  {
    method: "GET",
    path: "/account",
    handler: (): Response => htmlResponse(renderAccountPage()),
  },
  {
    method: "GET",
    path: "/auth/account",
    handler: async (_request, context): Promise<Response> =>
      privateJsonResponse({
        account: await context.service.getSnapshot(context.account),
      }),
  },
  {
    method: "POST",
    path: "/auth/account/mutations",
    handler: handleAccountMutation,
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
    return new URL(request.url).pathname === "/account"
      ? accountLoginResponse()
      : privateJsonResponse({ error: "Authentication required" }, 401);
  }

  try {
    return (
      (await accountRoutes.dispatch(request, {
        account,
        service: operations.account,
      })) ?? privateJsonResponse({ error: "Not Found" }, 404)
    );
  } catch (error) {
    return privateJsonResponse(
      { error: errorMessage(error, "Account request failed") },
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
      return accountResponse(
        await context.service.updateDisplayName(
          context.account,
          parsed.data.displayName,
        ),
      );
    case "revokePasskey":
      return accountResponse(
        await context.service.revokePasskey(
          context.account,
          parsed.data.credentialId,
        ),
      );
    case "revokeSession":
      return accountResponse(
        await context.service.revokeSession(
          context.account,
          parsed.data.sessionId,
        ),
      );
    case "revokeOtherSessions": {
      const result = await context.service.revokeOtherSessions(context.account);
      return privateJsonResponse({
        account: result.account,
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
    account: await context.service.getSnapshot(context.account),
  });
}

function accountResponse(account: AuthAccountSnapshot): Response {
  return privateJsonResponse({ account });
}

function accountLoginResponse(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login?return_to=%2Faccount",
      "Cache-Control": "no-store",
    },
  });
}

function withClearedSessionCookies(
  response: Response,
  request: Request,
): Response {
  const headers = new Headers(response.headers);
  for (const cookie of clearAuthSessionCookies(isSecureRequest(request))) {
    headers.append("Set-Cookie", cookie);
  }
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
