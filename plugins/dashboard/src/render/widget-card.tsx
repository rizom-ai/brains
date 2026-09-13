/** @jsxImportSource react */
import { OperatorPanel } from "@brains/operator-view-react";
import type { JSX } from "react";
import { DeclarativeWidgetBody } from "./declarative-widget";
import type { RenderableWidgetData } from "./types";
import { isPlainRecord } from "@brains/utils/predicates";

/**
 * A self-drawing widget's payload carries its own data beside the semantic
 * view. Hand the component that, so it sees its domain shape rather than the
 * envelope the declarative body reads.
 */
function sourceData(data: unknown): unknown {
  return isPlainRecord(data) && "source" in data ? data["source"] : data;
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
    <OperatorPanel
      heading={widget.widget.title}
      className={
        featured ? "card card--entity-summary" : "card widget-card--wide"
      }
    >
      {widget.component ? (
        <div className="widget-body widget-body--built-in">
          <widget.component data={sourceData(widget.data)} />
        </div>
      ) : (
        <DeclarativeWidgetBody widget={widget} launchPaths={{ studioPath }} />
      )}
    </OperatorPanel>
  );
}
