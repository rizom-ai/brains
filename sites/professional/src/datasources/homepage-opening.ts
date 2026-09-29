import type {
  BaseDataSourceContext,
  ServicePluginContext,
} from "@brains/plugins";
import {
  parseAskContent,
  contactFormDiscoveryRequest,
  type AskContent,
} from "@brains/contracts";

type OpeningRuntime = Pick<
  ServicePluginContext,
  "messaging" | "siteUrl" | "previewUrl" | "localSiteUrl" | "preferLocalUrls"
>;

export type HomepageOpeningData = AskContent & { contactUrl: string };

/** Build-time authored presentation only: no chat admission, tokens or generation.
 * A matching public form route is required and, for a preview build, reachable on
 * preview, where the door leads to the preview host. Contact advertises bounded
 * metadata in every process; workers never expose HTTP handlers. This is not
 * live readiness or admission evidence.
 */
export async function loadHomepageOpening(
  context: BaseDataSourceContext,
  runtime: OpeningRuntime,
): Promise<HomepageOpeningData | null> {
  try {
    const preview = context.publishedOnly === false;
    const siteOrigin = runtime.preferLocalUrls
      ? runtime.localSiteUrl
      : runtime.siteUrl;
    const origin =
      preview && !runtime.preferLocalUrls ? runtime.previewUrl : siteOrigin;
    if (!siteOrigin || !origin) return null;
    const response = await runtime.messaging.send({
      type: contactFormDiscoveryRequest.topic,
      payload: {},
    });
    if ("noop" in response || !response.success) return null;
    const discovered = contactFormDiscoveryRequest.response.safeParse(
      response.data,
    );
    if (
      !discovered.success ||
      discovered.data.origin !== new URL(siteOrigin).origin
    )
      return null;
    const routes = discovered.data.routes.filter(
      (route) =>
        route.path === "/contact" &&
        route.public &&
        (!preview || route.preview),
    );
    if (
      !["GET", "POST"].every((method) =>
        routes.some((route) => route.method === method),
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
