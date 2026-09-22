import type {
  BaseDataSourceContext,
  ServicePluginContext,
} from "@brains/plugins";
import { parseAskContent, type AskContent } from "@brains/contracts";

type OpeningRuntime = Pick<
  ServicePluginContext,
  | "webRoutes"
  | "identity"
  | "siteUrl"
  | "previewUrl"
  | "localSiteUrl"
  | "preferLocalUrls"
>;

export type HomepageOpeningData = AskContent & { contactUrl: string };

/** Build-time authored presentation only: no chat admission, tokens or generation.
 * A matching public form is required, including preview reachability and origin.
 */
export async function loadHomepageOpening(
  context: BaseDataSourceContext,
  runtime: OpeningRuntime,
): Promise<HomepageOpeningData | null> {
  try {
    const preview = context.publishedOnly === false;
    const origin = runtime.preferLocalUrls
      ? runtime.localSiteUrl
      : preview
        ? runtime.previewUrl
        : runtime.siteUrl;
    if (!origin) return null;
    const routes = runtime.webRoutes
      .getRoutes()
      .filter(
        (route) =>
          route.pluginId === "contact" &&
          route.fullPath === "/contact" &&
          route.definition.public &&
          (!preview || route.definition.preview),
      );
    if (
      !["GET", "POST"].every((method) =>
        routes.some((route) => (route.definition.method ?? "GET") === method),
      )
    )
      return null;
    const { endpoints } = await runtime.identity.getAppInfo();
    if (
      !endpoints.some(
        (endpoint) =>
          endpoint.pluginId === "contact" &&
          endpoint.visibility === "public" &&
          endpoint.url === new URL("/contact", origin).href,
      )
    )
      return null;
    const entity = await context.entityService.getEntity({
      entityType: "ask-content",
      id: "ask-content",
      visibilityScope: "public",
    });
    if (entity?.visibility !== "public") return null;
    const content = parseAskContent(entity.content);
    return content.title || content.introduction || content.topics?.length
      ? { ...content, contactUrl: new URL("/contact", origin).href }
      : null;
  } catch {
    // Missing/malformed optional authoring or unavailable dependencies omit the
    // placement; do not log copy, generate a replacement, or create a dead door.
    return null;
  }
}
