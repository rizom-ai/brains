/**
 * Base props shared by all dashboard widgets
 */
export interface BaseWidgetProps {
  title: string;
  description?: string | undefined;
  data: unknown;
}

export { StatsWidget } from "./StatsWidget";
export type { StatsWidgetProps } from "./StatsWidget";

export { ListWidget } from "./ListWidget";
export type { ListWidgetProps } from "./ListWidget";

export { CustomWidget } from "./CustomWidget";
export type { CustomWidgetProps } from "./CustomWidget";
