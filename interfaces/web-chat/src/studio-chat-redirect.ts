import type { RegisteredWebRoute } from "@brains/plugins";

const STUDIO_TYPES_SUFFIX = "/api/types";
const STUDIO_CHAT_WORKSPACE_ID = "web-chat:chat";

/** Resolve the native Chat door without importing Studio implementation code. */
export function resolveStudioChatRedirectPath(
  routes: readonly RegisteredWebRoute[],
  requestUrl: URL,
): string | undefined {
  const studioTypesRoute = routes.find(
    (route) =>
      route.pluginId === "studio" &&
      route.fullPath.endsWith(STUDIO_TYPES_SUFFIX) &&
      (route.definition.method ?? "GET") === "GET" &&
      route.definition.match !== "prefix",
  );
  if (!studioTypesRoute) return undefined;

  const basePath = studioTypesRoute.fullPath.slice(
    0,
    -STUDIO_TYPES_SUFFIX.length,
  );
  const pathname = `${basePath}/workspaces/${encodeURIComponent(STUDIO_CHAT_WORKSPACE_ID)}`;
  const session = requestUrl.searchParams.get("session")?.trim();
  if (!session || session.length > 256) return pathname;
  return `${pathname}?${new URLSearchParams({ session }).toString()}`;
}
