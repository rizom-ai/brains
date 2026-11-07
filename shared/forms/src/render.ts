import { escapeHtml } from "@brains/utils/string-utils";
import { FORM_COPY, type FormCopy } from "./copy";
import type { FormDefinition, FormField } from "./definition";

/** How a page shows a form: in whose name, in which theme. */
export interface FormPresentation {
  /** Who submissions go to, as the site names its owner; never empty. */
  owner?: string | undefined;
  theme?: "light" | "dark" | undefined;
}
/** What the visitor typed, by field id. */
export type FormDraft = Record<string, string>;

/**
 * The form's own look, drawn from the active theme's tokens. Every rule
 * starts at `:where(.form)`, so a site restyles any of it with `.form` in
 * front of its own selector, while a bare element reset does not undo it.
 */
const FORM_STYLES = `:where(.form){max-width:38rem;margin:clamp(1.5rem,6vw,4.5rem) auto;padding:0 clamp(1.25rem,6vw,1.5rem) 4rem;color:var(--color-text);line-height:1.6}:where(.form) *{box-sizing:border-box}
:where(.form) h1{font-family:var(--font-heading);font-weight:400;font-size:clamp(2.2rem,8vw,3.6rem);line-height:1.06;letter-spacing:-.02em;font-variation-settings:"SOFT" 30,"opsz" 96;margin:0 0 1rem;color:var(--color-heading,var(--color-text));overflow-wrap:anywhere}
:where(.form) p{max-width:60ch;color:var(--color-text-muted)}:where(.form) .form__intro{font-family:var(--font-heading);font-size:1.15rem;line-height:1.55;font-weight:300;margin:0 0 .5rem}
:where(.form) form{display:grid;gap:1.25rem;margin-block:1.75rem}:where(.form) .form__step{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem 1rem;min-width:0;border:0;padding:0;margin:0}:where(.form) legend{font-family:var(--font-heading);font-size:1.3rem;padding:0;margin-bottom:.75rem}
:where(.form) .form__field{display:grid;gap:.4rem;align-content:start;font-size:.9rem;font-weight:500;color:var(--color-text)}:where(.form) .form__field--long{grid-column:1/-1}:where(.form) .form__optional{font-weight:400;color:var(--color-text-muted)}
:where(.form) input,:where(.form) textarea{width:100%;min-width:0;font:400 1rem/1.5 var(--font-sans);color:var(--color-text);background:var(--color-bg-subtle,var(--color-bg));border:1px solid var(--color-border);border-radius:.5rem;padding:.75rem .85rem}:where(.form) [aria-invalid="true"]{border-color:var(--color-error)}
:where(.form) textarea{resize:vertical;min-height:9rem}:where(.form) button{justify-self:start;cursor:pointer;font:600 1rem/1 var(--font-sans);border:0;border-radius:.5rem;padding:1rem 1.5rem;background:var(--color-accent);color:var(--color-on-accent)}:where(.form) button:hover{filter:brightness(1.08)}
:where(.form) a{color:var(--color-accent);text-underline-offset:.2em}:where(.form) :focus-visible{outline:2px solid var(--color-accent);outline-offset:4px}:where(.form) .form__trap{position:absolute;left:-10000px}:where(.form) .form__error{margin:0;font-weight:400;color:var(--color-error)}
:where(.form) .form__notice{border-inline-start:2px solid var(--color-error);border-radius:.25rem;padding:1rem 1.25rem;background:var(--color-bg-subtle,var(--color-bg));color:var(--color-text);margin-block:1.5rem}
@media(max-width:540px){:where(.form) .form__step{grid-template-columns:1fr}:where(.form) button{width:100%}}`;

/** Visible copy, escaped, with the site's owner where it says `{owner}`. */
function fill(
  text: string,
  presentation: FormPresentation,
  copy: FormCopy,
): string {
  const owner = escapeHtml(presentation.owner ?? copy.ownerFallback);
  return escapeHtml(text).replaceAll("{owner}", owner);
}

function paragraphs(
  text: string | undefined,
  presentation: FormPresentation,
  copy: FormCopy,
  first: string,
  rest: string,
): string {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph, i) =>
        `<p${i === 0 ? first : rest}>${fill(paragraph, presentation, copy)}</p>`,
    )
    .join("");
}

function themeQuery(presentation: FormPresentation): string {
  return presentation.theme ? `?theme=${presentation.theme}` : "";
}

export function formSection(form: FormDefinition, body: string): string {
  return `<div class="form" data-form="${escapeHtml(form.id)}"><style>${FORM_STYLES}</style>${body}</div>`;
}

function fieldHtml(
  form: FormDefinition,
  field: FormField,
  draft: FormDraft,
  error: string | undefined,
  copy: FormCopy,
): string {
  const id = `form-${form.id}-${field.id}`;
  const value = escapeHtml((draft[field.id] ?? "").slice(0, field.maxLength));
  const optional = field.required
    ? ""
    : ` <span class="form__optional">${escapeHtml(copy.optional)}</span>`;
  const attributes = [
    `id="${id}"`,
    `name="${escapeHtml(field.id)}"`,
    ...(field.kind === "longText"
      ? ['rows="5"']
      : [`type="${field.kind === "email" ? "email" : "text"}"`]),
    ...(field.autocomplete ? [`autocomplete="${field.autocomplete}"`] : []),
    ...(error ? ['aria-invalid="true"', `aria-describedby="${id}-error"`] : []),
    ...(field.required ? ["required"] : []),
    `maxlength="${field.maxLength}"`,
  ].join(" ");
  const control =
    field.kind === "longText"
      ? `<textarea ${attributes}>${value}</textarea>`
      : `<input ${attributes} value="${value}">`;
  const message = error
    ? `<p class="form__error" id="${id}-error">${escapeHtml(error)}</p>`
    : "";
  const kind = field.kind === "longText" ? " form__field--long" : "";
  return `<div class="form__field${kind}"><label for="${id}">${escapeHtml(field.label)}${optional}</label>${control}${message}</div>`;
}

export interface FormRenderOptions {
  token: string;
  draft?: FormDraft | undefined;
  errors?: Record<string, string> | undefined;
  /** Why the last post was refused, above the form. */
  notice?: string | undefined;
  presentation?: FormPresentation | undefined;
  copy?: FormCopy | undefined;
}

export function renderForm(
  form: FormDefinition,
  options: FormRenderOptions,
): string {
  const presentation = options.presentation ?? {};
  const copy = options.copy ?? FORM_COPY;
  const draft = options.draft ?? {};
  const errors = options.errors ?? {};
  const notice = options.notice
    ? `<p class="form__notice" role="alert">${escapeHtml(options.notice)}</p>`
    : "";
  const steps = form.steps
    .map(
      (step) =>
        `<fieldset class="form__step">${step.title ? `<legend>${fill(step.title, presentation, copy)}</legend>` : ""}${step.fields
          .map((field) => fieldHtml(form, field, draft, errors[field.id], copy))
          .join("\n")}</fieldset>`,
    )
    .join("\n");
  return formSection(
    form,
    `<h1>${fill(form.title, presentation, copy)}</h1>${notice}
${paragraphs(form.intro, presentation, copy, ' class="form__intro"', ' class="form__intro"')}
<form method="post" action="${escapeHtml(form.path)}${themeQuery(presentation)}" accept-charset="UTF-8">
<input type="hidden" name="token" value="${escapeHtml(options.token)}">
${steps}
<div class="form__trap" aria-hidden="true"><label>${escapeHtml(copy.trap)}<input name="website" tabindex="-1" autocomplete="off" value=""></label></div>
<button type="submit">${fill(form.submitLabel, presentation, copy)}</button></form>`,
  );
}

/** Saved is what the visitor can be told; the owner's alert is sent separately. */
export function renderThanks(
  form: FormDefinition,
  presentation: FormPresentation = {},
  copy: FormCopy = FORM_COPY,
): string {
  return formSection(
    form,
    `<h1>${fill(form.thanks.title, presentation, copy)}</h1>${paragraphs(form.thanks.body, presentation, copy, ' class="form__intro"', "")}`,
  );
}

export function renderPaused(
  form: FormDefinition,
  copy: FormCopy = FORM_COPY,
): string {
  return formSection(
    form,
    `<h1>${escapeHtml(copy.paused.title)}</h1><p role="alert">${escapeHtml(copy.paused.body)}</p>`,
  );
}

/** A refusal before any form was issued: why, and a way to a new form. */
export function renderRefused(
  form: FormDefinition,
  message: string,
  presentation: FormPresentation = {},
  copy: FormCopy = FORM_COPY,
): string {
  return formSection(
    form,
    `<h1>${escapeHtml(copy.refusedTitle)}</h1><p class="form__notice" role="alert">${escapeHtml(message)}</p><p><a href="${escapeHtml(form.path)}${themeQuery(presentation)}">${escapeHtml(copy.newForm)}</a></p>`,
  );
}
