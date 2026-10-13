import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeadProvider, ImageRendererProvider } from "@brains/ui-library";
import {
  createHTMLShell,
  HeadCollector,
  type SiteImageRendererService,
} from "@brains/site-engine";
import type { ComponentType, MediaFormat, ViewTemplate } from "@brains/plugins";
import type { JsonObject } from "@brains/contracts";
import type { RenderMediaTemplateHtmlOptions } from "./types";

export function renderMediaTemplateHtml(
  options: RenderMediaTemplateHtmlOptions,
): string {
  const renderer = getRenderer(options.template, options.format);
  const validatedContent = options.template.schema.parse(options.content);

  const headCollector = new HeadCollector(options.siteConfig.title);
  const imageRenderer = createImageRenderer(options.imageBuildService);

  const page = h(HeadProvider, {
    headCollector,
    children: h(ImageRendererProvider, {
      imageRenderer,
      children: h(renderer, validatedContent),
    }),
  });

  const bodyHtml = renderToStaticMarkup(page);

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

function getRenderer(
  template: ViewTemplate,
  format: MediaFormat,
): ComponentType<JsonObject> {
  const renderer = template.renderers[format];
  if (!renderer || typeof renderer !== "function") {
    throw new Error(`No ${format} renderer for template: ${template.name}`);
  }
  return renderer;
}

function createImageRenderer(
  imageBuildService: SiteImageRendererService | null | undefined,
): ReturnType<SiteImageRendererService["createImageRenderer"]> | null {
  return imageBuildService?.createImageRenderer() ?? null;
}

function withNoindex(headHtml: string, noindex: boolean): string {
  if (!noindex) return headHtml;
  return `${headHtml}\n    <meta name="robots" content="noindex,nofollow">`;
}
