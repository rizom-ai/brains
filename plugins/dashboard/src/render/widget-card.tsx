/** @jsxImportSource react */
import { CardHeader } from "@brains/ui-library";
import type { JSX } from "react";
import { DeclarativeWidgetBody } from "./declarative-widget";
import type { RenderableWidgetData } from "./types";

/**
 * A self-drawing widget's payload carries its own data beside the semantic
 * view. Hand the component that, so it sees its domain shape rather than the
 * envelope the declarative body reads.
 */
function sourceData(data: unknown): unknown {
  return data !== null && typeof data === "object" && "source" in data
    ? (data as { source: unknown }).source
    : data;
}

export function WidgetCard({
  widget,
  featured = false,
  studioPath,
}: {
  widget: RenderableWidgetData;
  featured?: boolean;
  studioPath?: string | undefined;
}): JSX.Element {
  return (
    <article
      className={
        featured ? "card card--entity-summary" : "card widget-card--wide"
      }
    >
      <CardHeader title={widget.widget.title} />
      {widget.component ? (
        <div className="widget-body widget-body--built-in">
          <widget.component data={sourceData(widget.data)} />
        </div>
      ) : (
        <DeclarativeWidgetBody widget={widget} launchPaths={{ studioPath }} />
      )}
    </article>
  );
}
