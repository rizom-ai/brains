import { DASHBOARD_CHANNELS } from "@brains/contracts";
import type { OperatorCaller } from "../operator/operator-context-contract";
import type { IMessagingNamespace } from "./context-types";

export const DECLARATIVE_DASHBOARD_WIDGET_RENDERER =
  "DeclarativeOperatorWidget";

/**
 * A first-party widget's own renderer, drawn instead of the declarative block
 * vocabulary. Set only by `registerBuiltInDashboardWidget` — the published
 * authoring path never produces one, so external services stay declarative.
 *
 * Deliberately structural: the dashboard plugin owns the component type and
 * validates on receipt, so the shell never depends on a rendering library.
 */
export interface DashboardWidgetRenderer {
  component: unknown;
  clientStyles?: string | undefined;
  clientScript?: string | undefined;
}

export interface DashboardWidgetProviderContext {
  readonly caller: OperatorCaller | null;
  readonly signal: AbortSignal;
}

/**
 * A widget's registration, minus `pluginId` — the namespace fills that in from
 * the registering plugin so a widget cannot claim another plugin's id.
 *
 * Deliberately structural: the dashboard plugin owns the authoritative schema
 * and validates on receipt. This is the shape plugins write against.
 */
export interface DashboardDigestLine {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | undefined;
}

export interface DashboardWidgetRegistration {
  id: string;
  title: string;
  group: string;
  rendererName: typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER;
  dataProvider: (context: DashboardWidgetProviderContext) => Promise<unknown>;
  /**
   * Present means "draw this instead of the blocks". The dashboard resolves it
   * at render time from its own registry; it never travels with widget data.
   */
  renderer?: DashboardWidgetRenderer | undefined;
  description?: string | undefined;
  priority?: number | undefined;
  section?: "primary" | "secondary" | "sidebar" | undefined;
  visibility?: "public" | "trusted" | "admin" | undefined;
  needsAttention?: number | undefined;
  digest?: DashboardDigestLine[] | undefined;
  /** Derives the digest strip from the widget's own data. */
  digestProvider?:
    | ((data: unknown) => {
        digest?: DashboardDigestLine[];
        needsAttention?: number;
      })
    | undefined;
}

/** Dashboard namespace — widget contribution. */
export interface IDashboardNamespace {
  /** Whether a Dashboard host is currently mounted. */
  isAvailable(): boolean;
  /** Contribute a widget. Returns false when no Dashboard host is mounted. */
  registerWidget: (widget: DashboardWidgetRegistration) => Promise<boolean>;
  /** Withdraw widgets. Returns false when no Dashboard host is mounted. */
  unregisterWidget: (widgetId?: string) => Promise<boolean>;
}

function dashboardResponse(
  operation: "register" | "unregister",
  response: Awaited<ReturnType<IMessagingNamespace["send"]>>,
): boolean {
  if ("success" in response && response.success) return true;
  const error = "error" in response ? response.error : undefined;
  throw new Error(
    `Dashboard widget ${operation} failed: ${error ?? "unknown host error"}`,
  );
}

export function createDashboardNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
  hasHandler: (channel: string) => boolean,
): IDashboardNamespace {
  return {
    isAvailable: (): boolean => hasHandler(DASHBOARD_CHANNELS.registerWidget),
    registerWidget: async (widget): Promise<boolean> => {
      if (!hasHandler(DASHBOARD_CHANNELS.registerWidget)) return false;
      const response = await messaging.send({
        type: DASHBOARD_CHANNELS.registerWidget,
        payload: { ...widget, pluginId },
      });
      return dashboardResponse("register", response);
    },
    unregisterWidget: async (widgetId): Promise<boolean> => {
      if (!hasHandler(DASHBOARD_CHANNELS.unregisterWidget)) return false;
      const response = await messaging.send({
        type: DASHBOARD_CHANNELS.unregisterWidget,
        payload: { pluginId, ...(widgetId ? { widgetId } : {}) },
      });
      return dashboardResponse("unregister", response);
    },
  };
}
