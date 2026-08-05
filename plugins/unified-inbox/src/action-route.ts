import {
  requireSameOriginJson,
  type AuthPrincipal,
} from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import type { InboxOperatorService } from "./operator-service";
import { inboxActionRequestSchema } from "./schemas";

export const INBOX_ACTION_PATH = "/api/unified-inbox/actions" as const;

type InboxRoutePrincipal = Pick<AuthPrincipal, "permissionLevel">;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

interface InboxActionRouteOptions {
  getOperator(): Pick<InboxOperatorService, "act">;
  resolvePrincipal(request: Request): Promise<InboxRoutePrincipal | undefined>;
}

export function createInboxActionRoute(
  options: InboxActionRouteOptions,
): WebRouteDefinition {
  return {
    path: INBOX_ACTION_PATH,
    method: "POST",
    public: true,
    handler: async (request): Promise<Response> => {
      const requestError = requireSameOriginJson(request);
      if (requestError) return requestError;

      const principal = await options.resolvePrincipal(request);
      if (!principal) {
        return jsonResponse({ error: "Authentication required" }, 401);
      }
      if (principal.permissionLevel !== "admin") {
        return jsonResponse({ error: "Admin access required" }, 403);
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        rawPayload = undefined;
      }
      const payload = inboxActionRequestSchema.safeParse(rawPayload);
      if (!payload.success) {
        return jsonResponse({ error: "Invalid inbox action" }, 400);
      }

      try {
        const outcome = await options.getOperator().act(payload.data, {
          permissionLevel: principal.permissionLevel,
        });
        if (outcome.kind === "confirmation") {
          return jsonResponse(
            {
              confirmationRequired: true,
              summary: outcome.summary,
            },
            409,
          );
        }
        return jsonResponse({ success: true, data: outcome.data });
      } catch {
        return jsonResponse({ error: "Inbox action failed" }, 400);
      }
    },
  };
}
