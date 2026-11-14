import { resolveConsoleThemeCSS } from "@brains/console-theme";
import { SITE_SLOT_ATTRIBUTE } from "@brains/sdk/internal/interface-runtime";
import { createTemplate } from "@brains/sdk/internal/presentation";
import { escapeHtml } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { createElement, type ReactElement } from "react";
import type { FormDefinition } from "./definition";
import { formLanguages, localizeForm } from "./localize";

/**
 * The fallback page for a brain without the site's own page for a form: the
 * section on the active theme's tokens and fonts, with a way back to the site.
 */
export function formPage(
  fragment: string,
  options: {
    themeCSS?: string | undefined;
    theme?: "light" | "dark" | undefined;
    title: string;
    language?: string | undefined;
  },
): string {
  const theme = resolveConsoleThemeCSS(options.themeCSS).replace(
    /<\/style/gi,
    "<\\/style",
  );
  return `<!doctype html><html lang="${escapeHtml(options.language ?? "en")}" data-theme="${options.theme ?? "dark"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><style>${theme}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-sans)}
.form-nav{padding:1.1rem clamp(1.25rem,6vw,3rem)}.form-nav a{font-size:.9rem;text-decoration:none;color:var(--color-text-muted)}.form-nav a:hover{color:var(--color-text)}
</style></head><body><nav class="form-nav" aria-label="Site"><a href="/">← Back to the site</a></nav><main>${fragment}</main></body></html>`;
}

const pageSchema = z.object({ slot: z.string() });

/** The slot the site's page for a form leaves for it. */
function FormSlot({ slot }: z.output<typeof pageSchema>): ReactElement {
  return createElement("div", { [SITE_SLOT_ATTRIBUTE]: slot });
}

/** The site's page for a form: its layout around the slot the form fills per
 * request. A plugin registers it once, as `page`, for all its forms. */
export const formPageTemplate: ReturnType<typeof createTemplate> =
  createTemplate({
    name: "page",
    description: "A form's page on the site: its layout around the form's slot",
    schema: pageSchema,
    requiredPermission: "public",
    layout: { component: FormSlot },
  });

export interface FormSitePage {
  id: string;
  path: string;
  title: string;
  sections: { id: string; template: string; content: { slot: string } }[];
  navigation: { show: false };
  /** The languages the form is translated to, its pages built in each. */
  languages?: string[];
  translations?: Record<string, { title: string }>;
}

/** A form's two site pages, the form's and its thanks page, on the template
 * `<pluginId>:page`. */
export function formSitePages(
  form: FormDefinition,
  pluginId: string,
): FormSitePage[] {
  const languages = formLanguages(form);
  const page = (
    id: string,
    path: string,
    title: (served: FormDefinition) => string,
  ): FormSitePage => ({
    id,
    path,
    title: title(form),
    sections: [
      { id: "form", template: `${pluginId}:page`, content: { slot: form.id } },
    ],
    navigation: { show: false },
    ...(languages.length > 0
      ? {
          languages,
          translations: Object.fromEntries(
            languages.map((language) => [
              language,
              { title: title(localizeForm(form, language)) },
            ]),
          ),
        }
      : {}),
  });
  return [
    page(form.id, form.path, (served) => served.pageTitle),
    page(
      `${form.id}-thanks`,
      `${form.path}/thanks`,
      (served) => served.thanks.title,
    ),
  ];
}
