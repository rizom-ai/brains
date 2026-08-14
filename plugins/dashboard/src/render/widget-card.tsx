/** @jsxImportSource preact */
import { CardHeader } from "@rizom/brain-ui";
import type { JSX } from "preact";
import { DeclarativeWidgetBody } from "./declarative-widget";
import type { RenderableWidgetData } from "./types";

export function WidgetCard({
  widget,
  featured = false,
  cmsPath,
  accountPath,
  adminPath,
}: {
  widget: RenderableWidgetData;
  featured?: boolean;
  cmsPath?: string | undefined;
  accountPath?: string | undefined;
  adminPath?: string | undefined;
}): JSX.Element {
  return (
    <article
      class={featured ? "card card--entity-summary" : "card widget-card--wide"}
    >
      <CardHeader title={widget.widget.title} />
      <DeclarativeWidgetBody
        widget={widget}
        launchPaths={{ cmsPath, accountPath, adminPath }}
      />
    </article>
  );
}
