import { h } from "preact";
import { render } from "preact-render-to-string";
import { HeadProvider, ImageRendererProvider } from "@brains/ui-library";
import {
  createHTMLShell,
  HeadCollector,
  type SiteImageRendererService,
} from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import type {
  MediaPageRenderer,
  MediaPageTemplate,
  MediaTemplateFormat,
  RenderMediaTemplateHtmlOptions,
} from "./types";

const mediaTemplateContentSchema = z.record(z.string(), z.unknown());
type MediaTemplateContent = z.output<typeof mediaTemplateContentSchema>;

export function renderMediaTemplateHtml(
  options: RenderMediaTemplateHtmlOptions,
): string {
  const renderer = getRenderer(options.template, options.format);
  const contentObj: MediaTemplateContent = mediaTemplateContentSchema.parse(
    options.content,
  );
  const validatedContent: MediaTemplateContent =
    mediaTemplateContentSchema.parse(options.template.schema.parse(contentObj));

  const headCollector = new HeadCollector(options.siteConfig.title);
  const imageRenderer = createImageRenderer(options.imageBuildService);

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

function getRenderer(
  template: MediaPageTemplate,
  format: MediaTemplateFormat,
): MediaPageRenderer {
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
