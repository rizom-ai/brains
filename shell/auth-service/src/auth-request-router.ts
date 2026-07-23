import type {
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
} from "./types";
import type { OAuthEndpoints } from "./oauth-endpoints";
import type { SetupFlow } from "./setup-flow";
import type { WebAuthnEndpoints } from "./webauthn-endpoints";
import {
  corsPreflightResponse,
  htmlResponse,
  jsonResponse,
  safeRelativeReturnTo,
  withCors,
} from "./http-responses";
import { isSecureRequest } from "./issuer";
import { renderLoginPage } from "./pages";
import { AuthRouteTable, type AuthRoute } from "./route-table";
import { clearAuthSessionCookies } from "./session-store";

interface AuthRouteContext {
  issuer: string;
}

interface AuthRequestRoute extends AuthRoute<AuthRouteContext> {
  cors?: boolean;
}

export interface AuthRequestRouterOptions {
  setupFlow: SetupFlow;
  oauthEndpoints: OAuthEndpoints;
  webauthnEndpoints: WebAuthnEndpoints;
  handleAdminRequest: (request: Request) => Promise<Response>;
  revokeSession: (request: Request) => Promise<void>;
  getAuthorizationServerMetadata: (
    issuer: string,
  ) => AuthorizationServerMetadata;
  getProtectedResourceMetadata: (
    resource: string,
    issuer: string,
  ) => ProtectedResourceMetadata;
  getJwks: () => Promise<JwksResponse>;
}

export class AuthRequestRouter {
  private readonly routes: AuthRouteTable<AuthRouteContext>;

  constructor(options: AuthRequestRouterOptions) {
    const adminRoutes = [
      "/auth/admin/users",
      "/auth/admin/audit",
      "/auth/admin/anchor",
      "/auth/admin/mutations",
      "/auth/admin/reconciliation",
    ].map<AuthRequestRoute>((path) => ({
      method: "*",
      path,
      handler: options.handleAdminRequest,
    }));

    const endpointRoutes: AuthRequestRoute[] = [
      ...adminRoutes,
      {
        method: "GET",
        path: "/.well-known/oauth-authorization-server",
        cors: true,
        handler: (_request, context): Response =>
          jsonResponse(options.getAuthorizationServerMetadata(context.issuer)),
      },
      {
        method: "GET",
        path: "/.well-known/jwks.json",
        cors: true,
        handler: async (): Promise<Response> =>
          jsonResponse(await options.getJwks()),
      },
      {
        method: "GET",
        path: "/.well-known/oauth-protected-resource",
        cors: true,
        handler: (_request, context): Response =>
          jsonResponse(
            options.getProtectedResourceMetadata(
              context.issuer,
              context.issuer,
            ),
          ),
      },
      {
        method: "GET",
        path: "/setup",
        handler: (request): Promise<Response> =>
          options.setupFlow.handleSetupPage(request),
      },
      {
        method: "GET",
        path: "/login",
        handler: (request): Response => handleLoginPage(request),
      },
      {
        method: "GET",
        path: "/logout",
        handler: (request): Promise<Response> =>
          handleLogout(request, options.revokeSession),
      },
      {
        method: "POST",
        path: "/logout",
        handler: (request): Promise<Response> =>
          handleLogout(request, options.revokeSession),
      },
      {
        method: "POST",
        path: "/webauthn/register/options",
        handler: (request): Promise<Response> =>
          options.webauthnEndpoints.handleRegistrationOptions(request),
      },
      {
        method: "POST",
        path: "/webauthn/register/verify",
        handler: (request): Promise<Response> =>
          options.webauthnEndpoints.handleRegistrationVerify(request),
      },
      {
        method: "POST",
        path: "/webauthn/auth/options",
        handler: (request): Promise<Response> =>
          options.webauthnEndpoints.handleAuthenticationOptions(request),
      },
      {
        method: "POST",
        path: "/webauthn/auth/verify",
        handler: (request): Promise<Response> =>
          options.webauthnEndpoints.handleAuthenticationVerify(request),
      },
      {
        method: "GET",
        path: "/authorize",
        handler: (request): Promise<Response> =>
          options.oauthEndpoints.handleAuthorizePage(request),
      },
      {
        method: "POST",
        path: "/authorize",
        handler: (request): Promise<Response> =>
          options.oauthEndpoints.handleAuthorizeApproval(request),
      },
      {
        method: "POST",
        path: "/register",
        cors: true,
        handler: (request): Promise<Response> =>
          options.oauthEndpoints.handleClientRegistration(request),
      },
      {
        method: "POST",
        path: "/token",
        cors: true,
        handler: (request, context): Promise<Response> =>
          options.oauthEndpoints.handleTokenRequest(request, context.issuer),
      },
      {
        method: "POST",
        path: "/revoke",
        cors: true,
        handler: (request): Promise<Response> =>
          options.oauthEndpoints.handleRevokeRequest(request),
      },
    ];

    this.routes = new AuthRouteTable([
      ...endpointRoutes.map(withRouteCors),
      ...corsPreflightRoutes(endpointRoutes),
    ]);
  }

  async handle(request: Request, issuer: string): Promise<Response> {
    return (
      (await this.routes.dispatch(request, { issuer })) ??
      new Response("Not Found", { status: 404 })
    );
  }
}

function withRouteCors(route: AuthRequestRoute): AuthRoute<AuthRouteContext> {
  if (!route.cors) return route;
  return {
    ...route,
    handler: async (request, context): Promise<Response> =>
      withCors(await route.handler(request, context)),
  };
}

function corsPreflightRoutes(
  routes: AuthRequestRoute[],
): AuthRoute<AuthRouteContext>[] {
  return [
    ...new Set(routes.filter((route) => route.cors).map(({ path }) => path)),
  ].map((path) => ({
    method: "OPTIONS",
    path,
    handler: (): Response => corsPreflightResponse(),
  }));
}

function handleLoginPage(request: Request): Response {
  const returnTo = safeRelativeReturnTo(
    new URL(request.url).searchParams.get("return_to"),
  );
  return htmlResponse(renderLoginPage(returnTo));
}

async function handleLogout(
  request: Request,
  revokeSession: (request: Request) => Promise<void>,
): Promise<Response> {
  await revokeSession(request);
  const returnTo = safeRelativeReturnTo(
    new URL(request.url).searchParams.get("return_to"),
  );
  const headers = new Headers({
    Location: returnTo,
    "Cache-Control": "no-store",
  });
  for (const cookie of clearAuthSessionCookies(isSecureRequest(request))) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}
