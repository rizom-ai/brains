import type { BaseDataSourceContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  parseAskContent,
  contactFormDiscoveryRequest,
  type AskContent,
} from "@brains/contracts";

interface OpeningContext {
  entityService: Pick<BaseDataSourceContext["entityService"], "getEntity">;
  publishedOnly?: boolean | undefined;
}
interface OpeningRuntime {
  messaging: {
    send(message: {
      type: string;
      payload: Record<string, never>;
    }): Promise<unknown>;
  };
  siteUrl: string | undefined;
  previewUrl: string | undefined;
  localSiteUrl: string | undefined;
  preferLocalUrls: boolean;
}

export type HomepageOpeningData = AskContent & { contactUrl: string | null };

/**
 * Where the door leads: the contact form, when a matching public form route
 * serves where this build is served (for a preview build, on preview, where
 * the door leads to the preview host). The owner supplies bounded discovery in
 * every process; neither raw route registries nor endpoint advertisements are
 * available in separate workers. This is presentation, not live admission.
 */
async function contactUrl(
  context: OpeningContext,
  runtime: OpeningRuntime,
): Promise<string | null> {
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
    const envelope = z
      .object({
        success: z.literal(true),
        data: contactFormDiscoveryRequest.response,
      })
      .safeParse(response);
    if (!envelope.success) return null;
    const discovered = envelope.data.data;
    if (discovered.origin !== new URL(siteOrigin).origin) return null;
    const routes = discovered.routes.filter(
      (route) =>
        route.path === "/contact" &&
        route.public &&
        (!preview || route.preview),
    );
    return ["GET", "POST"].every((method) =>
      routes.some((route) => route.method === method),
    )
      ? new URL("/contact", origin).href
      : null;
  } catch {
    // Unreadable discovery cannot advertise a live door. Never log private copy.
    return null;
  }
}

/**
 * The authored opening's copy alone: the public ask-content note, when it says
 * something. Build-time authored presentation only: no chat admission, tokens
 * or generation. For a page that docks the box itself and needs no door.
 */
export async function loadAskContent(
  context: Pick<OpeningContext, "entityService">,
): Promise<AskContent | null> {
  try {
    const entity = await context.entityService.getEntity({
      entityType: "ask-content",
      id: "ask-content",
      visibilityScope: "public",
    });
    if (entity?.visibility !== "public") return null;
    const content = parseAskContent(entity.content);
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
  context: OpeningContext,
  runtime: OpeningRuntime,
): Promise<HomepageOpeningData | null> {
  const content = await loadAskContent(context);
  return content
    ? { ...content, contactUrl: await contactUrl(context, runtime) }
    : null;
}
