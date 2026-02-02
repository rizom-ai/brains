// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

/**
 * Schema for custom widget data - accepts any record
 */
const customDataSchema = z.record(z.unknown());

export type CustomWidgetProps = BaseWidgetProps;

/**
 * Custom widget renderer - displays generic key-value data
 */
export function CustomWidget({
  title,
  description,
  data,
}: CustomWidgetProps): VNode {
  const parsed = customDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="widget-container">
        <h3 className="text-lg font-semibold mb-3 text-theme">{title}</h3>
        {description && (
          <p className="text-sm text-theme-muted mb-3">{description}</p>
        )}
        <p className="text-sm text-theme-muted">No data available</p>
      </div>
    );
  }

  return (
    <div className="widget-container">
      <h3 className="text-lg font-semibold mb-3 text-theme">{title}</h3>
      {description && (
        <p className="text-sm text-theme-muted mb-3">{description}</p>
      )}
      <div className="text-theme text-sm space-y-2">
        {Object.entries(parsed.data).map(([key, value]) => (
          <div key={key}>
            <span className="font-medium">{key}: </span>
            <span className="text-theme-muted">
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
