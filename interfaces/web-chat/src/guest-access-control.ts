import { z } from "@brains/utils/zod";
import { createChatApiPaths } from "@brains/contracts/chat";
import type {
  InterfacePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { createDefaultGuestPolicy } from "./guest-preset";
import { GuestAdmission } from "./guest-admission";
import type { EnabledGuestPolicy } from "./guest-policy";

function privateJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Cookie" },
  });
}

const activationSchema = z.strictObject({ enabled: z.boolean() });

export interface GuestDoorStatus {
  authorized: boolean;
  /** Switched on and able to answer. */
  enabled: boolean;
  ready: boolean;
  usedRequests: number;
  /** Charged against the ceiling as reserved quotes; measured cost never returns it. */
  reservedMicroUsd: number;
  origin: string;
  allowance: { requests: number; maxCostMicroUsd: number };
}
interface BrowserAccess {
  hasChatAccess: boolean;
  permissionLevel: string;
}
type ControlContext = Pick<
  InterfacePluginContext,
  "runtimeState" | "siteUrl" | "previewUrl"
>;

/** Operator authorization of the existing guest runtime, not deployment configuration. */
export class GuestAccessControl {
  readonly policy: EnabledGuestPolicy | undefined;
  private readonly admission: GuestAdmission | undefined;
  private readonly context: ControlContext;
  private readonly resolveAccess: (request: Request) => Promise<BrowserAccess>;
  private readonly ready: () => boolean;
  constructor(
    context: ControlContext,
    resolveAccess: (request: Request) => Promise<BrowserAccess>,
    ready: () => boolean,
    available: boolean,
    now?: () => number,
  ) {
    this.context = context;
    this.resolveAccess = resolveAccess;
    this.ready = ready;
    const origin = context.previewUrl;
    if (
      !available ||
      !origin ||
      !context.siteUrl ||
      origin === context.siteUrl ||
      new URL(origin).protocol !== "https:"
    )
      return;
    const defaults = createDefaultGuestPolicy(origin);
    if (!defaults.enabled) return;
    this.policy = {
      ...defaults,
      allowance: {
        requests: defaults.limits.globalRequestsPerDay,
        maxCostMicroUsd: Math.floor(defaults.budget.dailyUsd * 1_000_000),
      },
    };
    this.admission = new GuestAdmission(context.runtimeState, this.policy, {
      requireAuthorization: true,
      ...(now ? { now } : {}),
    });
  }

  async isAuthorized(): Promise<boolean> {
    return (await this.admission?.accessStatus())?.authorized === true;
  }

  /** The owner's view of the door: switched on, answering, and what the allowance has spent. */
  async status(): Promise<GuestDoorStatus | undefined> {
    if (!this.policy || !this.admission) return undefined;
    const state = await this.admission.accessStatus();
    if (!state) return undefined;
    return {
      ...state,
      enabled: state.enabled && this.ready(),
      ready: this.ready(),
      origin: this.policy.origin,
      allowance: {
        requests: this.policy.allowance?.requests ?? 0,
        maxCostMicroUsd: this.policy.allowance?.maxCostMicroUsd ?? 0,
      },
    };
  }

  /** Opens guest chat; never renews the allowance. */
  async switchOn(): Promise<"on" | "not-ready" | "unavailable"> {
    if (!this.admission) return "unavailable";
    if (!this.ready()) return "not-ready";
    return (await this.admission.authorize()) ? "on" : "unavailable";
  }

  /** Closes guest chat; admissions stop at once. */
  async switchOff(): Promise<"off" | "unavailable"> {
    if (!this.admission) return "unavailable";
    return (await this.admission.applyPolicy(false)) ? "off" : "unavailable";
  }

  /** Guest chat can answer: authorized, switched on, allowance left, guest profile ready. */
  async isOpen(): Promise<boolean> {
    return (
      (await this.admission?.accessStatus())?.enabled === true && this.ready()
    );
  }

  routes(apiPath: string): WebRouteDefinition[] {
    const path = `${createChatApiPaths(apiPath).stream}/guest/access`;
    return (["GET", "POST"] as const).map((method) => ({
      path,
      method,
      public: true,
      handler: async (request): Promise<Response> => {
        try {
          const access = await this.resolveAccess(request);
          if (!access.hasChatAccess)
            return privateJsonResponse(
              { error: "Authentication required" },
              401,
            );
          if (access.permissionLevel !== "admin")
            return privateJsonResponse({ error: "Forbidden" }, 403);
          if (!this.policy || !this.admission || !this.context.siteUrl)
            return privateJsonResponse(
              { error: "Preview guest access unavailable" },
              503,
            );
          if (request.method !== method)
            return privateJsonResponse({ error: "Method not allowed" }, 405);
          // The management action is on the authenticated primary origin. The
          // target always comes from deployment context, never forwarding headers.
          if (new URL(request.url).host !== new URL(this.context.siteUrl).host)
            return privateJsonResponse(
              { error: "Guest authorization denied" },
              403,
            );
          if (method === "POST") {
            if (
              request.headers.get("origin") !== this.context.siteUrl ||
              request.headers.get("sec-fetch-site") === "cross-site"
            )
              return privateJsonResponse(
                { error: "Same-origin request required" },
                403,
              );
            if (
              request.headers
                .get("content-type")
                ?.split(";")[0]
                ?.trim()
                .toLowerCase() !== "application/json"
            )
              return privateJsonResponse({ error: "JSON required" }, 415);
            let body: unknown;
            try {
              body = await request.json();
            } catch {
              return privateJsonResponse(
                { error: "Invalid activation request" },
                400,
              );
            }
            const parsed = activationSchema.safeParse(body);
            if (!parsed.success)
              return privateJsonResponse(
                { error: "Invalid activation request" },
                400,
              );
            const switched = parsed.data.enabled
              ? await this.switchOn()
              : await this.switchOff();
            if (switched === "not-ready")
              return privateJsonResponse(
                { error: "Guest profile unavailable" },
                503,
              );
            if (switched === "unavailable")
              return privateJsonResponse(
                { error: "Guest authorization unavailable" },
                503,
              );
          }
          const state = await this.admission.accessStatus();
          if (!state)
            return privateJsonResponse(
              { error: "Guest accounting unavailable" },
              503,
            );
          return privateJsonResponse({
            ...state,
            enabled: state.enabled && this.ready(),
            origin: this.policy.origin,
            allowance: {
              requests: this.policy.allowance?.requests,
              usd: (this.policy.allowance?.maxCostMicroUsd ?? 0) / 1_000_000,
            },
          });
        } catch {
          // Authentication, runtime-state and provider details must stay private.
          return privateJsonResponse(
            { error: "Guest authorization unavailable" },
            503,
          );
        }
      },
    }));
  }
}
