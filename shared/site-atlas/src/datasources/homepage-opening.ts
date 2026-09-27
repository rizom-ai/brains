import type {
  BaseDataSourceContext,
  ServicePluginContext,
} from "@brains/plugins";
import { parseAskContent, type AskContent } from "@brains/contracts";

type OpeningRuntime = Pick<
  ServicePluginContext,
  "webRoutes" | "siteUrl" | "previewUrl" | "localSiteUrl" | "preferLocalUrls"
>;

export type HomepageOpeningData = AskContent & { contactUrl: string | null };

/**
 * Where the door leads: the contact form, when a matching public form route
 * serves where this build is served (for a preview build, on preview, where
 * the door leads to the preview host). Routes are declared in every process;
 * endpoint advertisement is not, and a separate worker runs site builds.
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
        route.pluginId === "contact" &&
        route.fullPath === "/contact" &&
        route.definition.public &&
        (!preview || route.definition.preview),
    );
  return ["GET", "POST"].every((method) =>
    routes.some((route) => (route.definition.method ?? "GET") === method),
  )
    ? new URL("/contact", origin).href
    : null;
}

/** Build-time authored presentation only: no chat admission, tokens or generation.
 * The authored words stand on their own; the door is there only when a
 * contact form can receive it, so a page without one never shows a dead door.
 */
export async function loadHomepageOpening(
  context: BaseDataSourceContext,
  runtime: OpeningRuntime,
): Promise<HomepageOpeningData | null> {
  try {
    const entity = await context.entityService.getEntity({
      entityType: "ask-content",
      id: "ask-content",
      visibilityScope: "public",
    });
    if (entity?.visibility !== "public") return null;
    const content = parseAskContent(entity.content);
    return content.title || content.introduction || content.topics?.length
      ? { ...content, contactUrl: contactUrl(context, runtime) }
      : null;
  } catch {
    // Missing/malformed optional authoring or unavailable dependencies omit the
    // placement; do not log copy, generate a replacement, or create a dead door.
    return null;
  }
}
