import { DASHBOARD_CHANNELS } from "@brains/contracts";
import type { IMessagingNamespace } from "./context-types";

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
  rendererName: string;
  dataProvider: () => Promise<unknown>;
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
        /** @deprecated Use needsAttention. */
        needsOperator?: number;
      })
    | undefined;
  component?: unknown;
  clientStyles?: string | undefined;
  clientScript?: string | undefined;
}

/** Dashboard namespace — widget contribution. */
export interface IDashboardNamespace {
  /** Contribute a widget to the dashboard. No-op when no dashboard is mounted. */
  registerWidget: (widget: DashboardWidgetRegistration) => Promise<void>;
  /** Withdraw this plugin's widgets, or one of them by id. */
  unregisterWidget: (widgetId?: string) => Promise<void>;
}

export function createDashboardNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
): IDashboardNamespace {
  return {
    registerWidget: async (widget): Promise<void> => {
      await messaging.send({
        type: DASHBOARD_CHANNELS.registerWidget,
        payload: { ...widget, pluginId },
      });
    },
    unregisterWidget: async (widgetId): Promise<void> => {
      await messaging.send({
        type: DASHBOARD_CHANNELS.unregisterWidget,
        payload: { pluginId, ...(widgetId ? { widgetId } : {}) },
      });
    },
  };
}
