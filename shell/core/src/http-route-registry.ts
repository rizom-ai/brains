import {
  type ApiRouteDefinition,
  type PluginManager,
  type RegisteredApiRoute,
  type RegisteredWebRoute,
  type WebRouteDefinition,
} from "@brains/plugins";
import type {
  HttpRouteManifestEntry,
  RegisteredHandlerHttpRoute,
  RegisteredHttpRoute,
  RegisteredToolHttpRoute,
} from "@brains/plugins/internal/http-routes";
import { WebRouteMethods } from "@brains/plugins/contracts/web-routes";
import { SITE_BUILD_MANIFEST_PATH } from "@brains/contracts";

const RESERVED_PATHS = ["/health", "/images"] as const;
const RESERVED_EXACT_PATHS = new Set<string>([SITE_BUILD_MANIFEST_PATH]);
const WEB_ROUTE_METHODS = new Set<string>(WebRouteMethods);
const TOOL_ROUTE_METHODS = new Set<string>(["GET", "POST", "PUT", "DELETE"]);

export interface HttpRouteContributor {
  pluginId: string;
  webRoutes: readonly WebRouteDefinition[];
  apiRoutes: readonly ApiRouteDefinition[];
}

export function collectHttpRouteContributors(
  pluginManager: PluginManager,
): HttpRouteContributor[] {
  const contributors: HttpRouteContributor[] = [];
  for (const [pluginId, { plugin }] of pluginManager.getAllPlugins()) {
    let webRoutes: WebRouteDefinition[];
    let apiRoutes: ApiRouteDefinition[];
    try {
      webRoutes = plugin.getWebRoutes?.() ?? [];
      apiRoutes = plugin.getApiRoutes?.() ?? [];
    } catch (error) {
      throw new Error(
        `Failed to collect HTTP route declarations from plugin "${pluginId}"`,
        { cause: error },
      );
    }
    contributors.push({ pluginId, webRoutes, apiRoutes });
  }
  return contributors;
}

function isReservedPath(path: string): boolean {
  return (
    RESERVED_EXACT_PATHS.has(path) ||
    RESERVED_PATHS.some(
      (reserved) => path === reserved || path.startsWith(`${reserved}/`),
    )
  );
}

function assertValidPath(
  path: string,
  pluginId: string,
  checkReservedNamespace: boolean = true,
): void {
  let canonicalPath: string | undefined;
  try {
    canonicalPath = new URL(path, "http://route.invalid").pathname;
  } catch {
    canonicalPath = undefined;
  }
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("%") ||
    (path.length > 1 && path.endsWith("/")) ||
    path.trim() !== path ||
    canonicalPath !== path ||
    (checkReservedNamespace && isReservedPath(path))
  ) {
    throw new Error(
      `Invalid HTTP route path "${path}" declared by plugin "${pluginId}"`,
    );
  }
}

function assertMethodIn(
  allowedMethods: ReadonlySet<string>,
  method: string,
  pluginId: string,
): void {
  if (!allowedMethods.has(method)) {
    throw new Error(
      `Invalid HTTP route method "${method}" declared by plugin "${pluginId}"`,
    );
  }
}

function assertValidMatch(match: string, pluginId: string): void {
  if (match !== "exact" && match !== "prefix") {
    throw new Error(
      `Invalid HTTP route match "${match}" declared by plugin "${pluginId}"`,
    );
  }
}

function normalizeHandlerRoute(
  contributor: HttpRouteContributor,
  definition: WebRouteDefinition,
): RegisteredHandlerHttpRoute {
  assertValidPath(definition.path, contributor.pluginId);
  const method = definition.method ?? "GET";
  assertMethodIn(WEB_ROUTE_METHODS, method, contributor.pluginId);
  const match = definition.match ?? "exact";
  assertValidMatch(match, contributor.pluginId);
  if (typeof definition.handler !== "function") {
    throw new Error(
      `Invalid HTTP route handler for "${definition.path}" declared by plugin "${contributor.pluginId}"`,
    );
  }
  return Object.freeze({
    kind: "handler",
    ownerPluginId: contributor.pluginId,
    fullPath: definition.path,
    method,
    match,
    sharedHostAdmission: definition.public === true ? "admit" : "deny",
    handler: definition.handler,
  });
}

function normalizeToolRoute(
  contributor: HttpRouteContributor,
  definition: ApiRouteDefinition,
): RegisteredToolHttpRoute {
  assertValidPath(definition.path, contributor.pluginId, false);
  const fullPath = `/api/${contributor.pluginId}${definition.path}`;
  assertValidPath(fullPath, contributor.pluginId);
  assertMethodIn(TOOL_ROUTE_METHODS, definition.method, contributor.pluginId);
  if (typeof definition.tool !== "string" || definition.tool.trim() === "") {
    throw new Error(
      `Invalid HTTP route tool for "${fullPath}" declared by plugin "${contributor.pluginId}"`,
    );
  }
  return Object.freeze({
    kind: "tool",
    ownerPluginId: contributor.pluginId,
    fullPath,
    method: definition.method,
    match: "exact",
    sharedHostAdmission: definition.public ? "admit" : "deny",
    definition: Object.freeze({ ...definition }),
  });
}

function assertUniqueRouteKeys(routes: readonly RegisteredHttpRoute[]): void {
  const owners = new Map<string, string>();
  for (const route of routes) {
    const key = `${route.method} ${route.fullPath}`;
    const existingOwner = owners.get(key);
    if (existingOwner !== undefined) {
      throw new Error(
        `HTTP route conflict for ${key} between plugins "${existingOwner}" and "${route.ownerPluginId}"`,
      );
    }
    owners.set(key, route.ownerPluginId);
  }
}

function createManifest(
  routes: readonly RegisteredHttpRoute[],
): readonly HttpRouteManifestEntry[] {
  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        ownerPluginId: route.ownerPluginId,
        kind: route.kind,
        method: route.method,
        fullPath: route.fullPath,
        match: route.match,
        sharedHostAdmission: route.sharedHostAdmission,
      }),
    ),
  );
}

export class HttpRouteRegistry {
  private routes: readonly RegisteredHttpRoute[] | undefined;
  private manifest: readonly HttpRouteManifestEntry[] | undefined;
  private apiRoutes: readonly RegisteredApiRoute[] | undefined;
  private webRoutes: readonly RegisteredWebRoute[] | undefined;

  public static createFresh(): HttpRouteRegistry {
    return new HttpRouteRegistry();
  }

  private constructor() {}

  public finalize(
    contributors: readonly HttpRouteContributor[],
  ): readonly RegisteredHttpRoute[] {
    if (this.routes !== undefined) {
      throw new Error("HTTP route registry has already been finalized");
    }

    const routes: RegisteredHttpRoute[] = [];
    const webRoutes: RegisteredWebRoute[] = [];
    const apiRoutes: RegisteredApiRoute[] = [];
    for (const contributor of contributors) {
      for (const definition of contributor.webRoutes) {
        routes.push(normalizeHandlerRoute(contributor, definition));
        webRoutes.push(
          Object.freeze({
            pluginId: contributor.pluginId,
            fullPath: definition.path,
            definition: Object.freeze({ ...definition }),
          }),
        );
      }
      for (const definition of contributor.apiRoutes) {
        const route = normalizeToolRoute(contributor, definition);
        routes.push(route);
        apiRoutes.push(
          Object.freeze({
            pluginId: contributor.pluginId,
            fullPath: route.fullPath,
            definition: route.definition,
          }),
        );
      }
    }
    assertUniqueRouteKeys(routes);

    this.routes = Object.freeze(routes);
    this.manifest = createManifest(this.routes);
    this.webRoutes = Object.freeze(webRoutes);
    this.apiRoutes = Object.freeze(apiRoutes);
    return this.routes;
  }

  public getSnapshot(): readonly RegisteredHttpRoute[] {
    if (this.routes === undefined) {
      throw new Error("HTTP route registry has not been finalized");
    }
    return this.routes;
  }

  public getManifest(): readonly HttpRouteManifestEntry[] {
    if (this.manifest === undefined) {
      throw new Error("HTTP route registry has not been finalized");
    }
    return this.manifest;
  }

  public getApiRoutes(): RegisteredApiRoute[] {
    if (this.apiRoutes === undefined) {
      throw new Error("HTTP route registry has not been finalized");
    }
    return [...this.apiRoutes];
  }

  public getWebRoutes(): RegisteredWebRoute[] {
    if (this.webRoutes === undefined) {
      throw new Error("HTTP route registry has not been finalized");
    }
    return [...this.webRoutes];
  }
}
