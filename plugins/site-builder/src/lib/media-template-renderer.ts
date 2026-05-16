import { h } from "preact";
import { render } from "preact-render-to-string";
import { HeadProvider, ImageRendererProvider } from "@brains/ui-library";
import {
  createHTMLShell,
  HeadCollector,
  type SiteImageRendererService,
} from "@brains/site-engine";
import { z } from "@brains/utils";
import type { SiteViewTemplate } from "./site-view-template";
import type { SiteBuilderOptions } from "../types/site-builder-types";

export type MediaTemplateFormat = "image" | "pdf";

export interface RenderMediaTemplateHtmlOptions {
  template: SiteViewTemplate;
  format: MediaTemplateFormat;
  content: unknown;
  siteConfig: Pick<SiteBuilderOptions["siteConfig"], "title" | "themeMode">;
  imageBuildService?: SiteImageRendererService | null | undefined;
  noindex?: boolean;
}

export function renderMediaTemplateHtml(
  options: RenderMediaTemplateHtmlOptions,
): string {
  const renderer = options.template.renderers[options.format];
  if (!renderer || typeof renderer !== "function") {
    throw new Error(
      `No ${options.format} renderer for template: ${options.template.name}`,
    );
  }

  const contentObj = z.record(z.unknown()).parse(options.content);
  const validatedContent = z
    .record(z.unknown())
    .parse(options.template.schema.parse(contentObj));

  const headCollector = new HeadCollector(options.siteConfig.title);
  const imageRenderer =
    options.imageBuildService?.createImageRenderer() ?? null;

  const page = h(HeadProvider, {
    headCollector,
    children: h(ImageRendererProvider, {
      imageRenderer,
      children: h(renderer, validatedContent),
    }),
  });

  const bodyHtml = render(page);

  if (!headCollector.getHeadProps()) {
    headCollector.setHeadProps({
      title: options.siteConfig.title,
    });
  }

  const headHtml = withNoindex(
    headCollector.generateHeadHTML(),
    options.noindex ?? true,
  );

  return createHTMLShell(
    bodyHtml,
    headHtml,
    options.siteConfig.title,
    options.siteConfig.themeMode,
  );
}

function withNoindex(headHtml: string, noindex: boolean): string {
  if (!noindex) return headHtml;
  return `${headHtml}\n    <meta name="robots" content="noindex,nofollow">`;
}
