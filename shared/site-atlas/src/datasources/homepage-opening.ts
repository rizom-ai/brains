import type {
  BaseDataSourceContext,
  IWebRoutesNamespace,
} from "@brains/sdk/internal/service-runtime";
import { findRouteByRole } from "@brains/sdk/internal/site-runtime";
import { askContentFromRecord, type AskContent } from "@brains/contracts";

/** Where the build is served, and the routes the door may lead to. */
interface OpeningRuntime {
  readonly siteUrl: string | undefined;
  readonly previewUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  readonly webRoutes: Pick<IWebRoutesNamespace, "getRoutes">;
}

export type HomepageOpeningData = AskContent & { contactUrl: string | null };

/**
 * Where the door leads: the contact form, found by its role, when it serves
 * both its page and its post publicly where this build is served (for a
 * preview build, on preview, where the door leads to the preview host).
 * Routes are declared in every process; endpoint advertisement is not, and a
 * separate worker runs site builds.
 */
function contactUrl(
  context: BaseDataSourceContext,
  runtime: OpeningRuntime,
): string | null {
  const preview = context.publishedOnly === false;
  const siteOrigin = runtime.preferLocalUrls
    ? runtime.localSiteUrl
    : runtime.siteUrl;
  const origin =
    preview && !runtime.preferLocalUrls ? runtime.previewUrl : siteOrigin;
  if (!siteOrigin || !origin) return null;
  const routes = runtime.webRoutes
    .getRoutes()
    .filter(
      (route) =>
        route.definition.role === "contact-form" &&
        route.definition.public &&
        (!preview || route.definition.preview),
    );
  const path = findRouteByRole(routes, "contact-form")?.fullPath;
  return path &&
    ["GET", "POST"].every((method) =>
      routes.some(
        (route) =>
          route.fullPath === path &&
          (route.definition.method ?? "GET") === method,
      ),
    )
    ? new URL(path, origin).href
    : null;
}

/**
 * The authored opening's copy alone: the public ask-content note, when it says
 * something. Build-time authored presentation only: no chat admission, tokens
 * or generation. For a page that docks the box itself and needs no door.
 */
export async function loadAskContent(
  context: Pick<BaseDataSourceContext, "entityService">,
): Promise<AskContent | null> {
  try {
    const entity = await context.entityService.getEntity({
      entityType: "ask-content",
      id: "ask-content",
      visibilityScope: "public",
    });
    if (entity?.visibility !== "public") return null;
    const content = askContentFromRecord(entity);
    return content.title || content.introduction || content.topics?.length
      ? content
      : null;
  } catch {
    // Missing/malformed optional authoring or unavailable dependencies omit the
    // placement; do not log copy, generate a replacement, or create a dead door.
    return null;
  }
}

/** The authored words stand on their own; the door is there only when a
 * contact form can receive it, so a page without one never shows a dead door.
 */
export async function loadHomepageOpening(
  context: BaseDataSourceContext,
  runtime: OpeningRuntime,
): Promise<HomepageOpeningData | null> {
  const content = await loadAskContent(context);
  return content
    ? { ...content, contactUrl: contactUrl(context, runtime) }
    : null;
}
