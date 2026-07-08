/**
 * Base props shared by all dashboard widgets
 */
export interface BaseWidgetProps {
  title: string;
  description?: string | undefined;
  data: unknown;
}
