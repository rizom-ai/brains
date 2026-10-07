import {
  defineRoute,
  formatContentDispositionHeader,
  sdkErrorSchema,
  verbatim,
  type AnyInterfaceRouteDefinition,
} from "@brains/sdk/interfaces";
import type { ChatPlatformState } from "./platform-state";
import type { ChatUploadReader } from "./types";

/** The public HTTP a platform's adapter needs: its webhook, and its uploads. */
export function platformRoutes(
  state: ChatPlatformState,
): AnyInterfaceRouteDefinition[] {
  const { platform } = state;
  return [
    defineRoute({
      method: "POST",
      path: `/api/webhooks/chat/${platform}`,
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) => webhook(state, request),
    }),
    defineRoute({
      method: "GET",
      path: `/api/webhooks/chat/${platform}/uploads`,
      security: { kind: "public" },
      response: verbatim,
      handle: ({ request }) =>
        serveUpload(request, state.uploads.platformStore),
    }),
  ];
}

async function webhook(
  state: ChatPlatformState,
  request: Request,
): Promise<Response> {
  const label = state.platform === "discord" ? "Discord" : "Slack";
  const socketMode =
    state.platform === "slack" &&
    "mode" in state.platformConfig &&
    state.platformConfig.mode !== "webhook";
  const handler = state.app.webhooks?.[state.platform];
  if (socketMode || !handler) {
    return new Response(`${label} chat webhook not configured`, {
      status: 404,
    });
  }
  return handler(request);
}

/**
 * Serve an upload this platform's adapter stored, by ref.
 *
 * A ref that does not resolve is genuinely absent. Stored metadata that
 * cannot be read, or a fault while building the response, is a failure on this
 * side, and saying "not found" would send the caller looking for a problem
 * they do not have.
 */
export async function serveUpload(
  request: Request,
  store: ChatUploadReader | undefined,
): Promise<Response> {
  const uploadId = new URL(request.url).searchParams.get("id")?.trim();
  if (!uploadId) {
    return new Response("Missing upload id", { status: 400 });
  }
  if (!store) {
    return new Response("Chat upload storage unavailable", { status: 503 });
  }
  try {
    const { record, content } = await store.read(uploadId);
    const body = new Uint8Array(content).buffer;
    return new Response(body, {
      headers: {
        "Content-Type": record.mediaType,
        "Content-Length": String(content.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": formatContentDispositionHeader({
          disposition: new URL(request.url).searchParams.has("download")
            ? "attachment"
            : "inline",
          filename: record.filename,
        }),
      },
    });
  } catch (error) {
    const code = sdkErrorSchema.safeParse(error).data?.code;
    if (code === "not_found" || code === "invalid_input") {
      return new Response("Upload not found", { status: 404 });
    }
    return new Response("Upload could not be read", { status: 500 });
  }
}
