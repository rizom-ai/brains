import { escapeHtml } from "@brains/utils/string-utils";
import { resolveConsoleThemeCSS } from "@brains/console-theme";

export interface ContactDraft {
  name?: string;
  email?: string;
  message?: string;
}
export interface ContactPresentation {
  themeCSS?: string;
  theme?: "light" | "dark";
  /** Who the note goes to, as the site names its owner. */
  owner?: string;
}

/** Runtime pages use the active theme's semantic tokens, never site-specific
 * palettes or layouts. No external fonts/assets or scripts load with private drafts.
 */
export function contactPage(
  body: string,
  presentation: ContactPresentation = {},
): string {
  const theme = resolveConsoleThemeCSS(presentation.themeCSS, {
    imports: "remove",
  }).replace(/<\/style/gi, "<\\/style");
  return `<!doctype html><html lang="en" data-theme="${presentation.theme ?? "dark"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contact</title><style>${theme}
*{box-sizing:border-box}body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-sans);line-height:1.6}
.contact-nav{padding:1.1rem clamp(1.25rem,6vw,3rem)}.contact-nav a{font-size:.9rem;text-decoration:none;color:var(--color-text-muted)}.contact-nav a:hover{color:var(--color-text)}
main{max-width:38rem;margin:clamp(1.5rem,6vw,4.5rem) auto;padding:0 clamp(1.25rem,6vw,1.5rem) 4rem}
h1{font-family:var(--font-heading);font-weight:400;font-size:clamp(2.2rem,8vw,3.6rem);line-height:1.06;letter-spacing:-.02em;font-variation-settings:"SOFT" 30,"opsz" 96;margin:0 0 1rem;color:var(--color-heading,var(--color-text));overflow-wrap:anywhere}
p{max-width:60ch;color:var(--color-text-muted)}.introduction{font-family:var(--font-heading);font-size:1.15rem;line-height:1.55;font-weight:300;margin:0 0 .5rem}.privacy{font-size:.85rem;line-height:1.6;margin:1.25rem 0 .5rem}
form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem 1rem;margin-block:1.75rem}
label{display:grid;gap:.4rem;font-size:.9rem;font-weight:500;color:var(--color-text)}.message{grid-column:1/-1}.optional{font-weight:400;color:var(--color-text-muted)}
input,textarea{width:100%;min-width:0;font:400 1rem/1.5 var(--font-sans);color:var(--color-text);background:var(--color-bg-subtle,var(--color-bg));border:1px solid var(--color-border);border-radius:.5rem;padding:.75rem .85rem}
textarea{resize:vertical;min-height:9rem}button{grid-column:1/-1;justify-self:start;cursor:pointer;font:600 1rem/1 var(--font-sans);border:0;border-radius:.5rem;padding:1rem 1.5rem;background:var(--color-accent);color:var(--color-on-accent)}button:hover{filter:brightness(1.08)}
a{color:var(--color-accent);text-underline-offset:.2em}:focus-visible{outline:2px solid var(--color-accent);outline-offset:4px}.trap{position:absolute;left:-10000px}.notice{border-inline-start:2px solid var(--color-error);border-radius:.25rem;padding:1rem 1.25rem;background:var(--color-bg-subtle,var(--color-bg));color:var(--color-text);margin-block:1.5rem}.retry{font-size:.85rem}
@media(max-width:540px){form{grid-template-columns:1fr}button{width:100%}}
</style></head><body><nav class="contact-nav" aria-label="Site"><a href="/">← Back to the site</a></nav><main>${body}</main></body></html>`;
}

function recipient(presentation: ContactPresentation): string {
  return presentation.owner
    ? escapeHtml(presentation.owner)
    : "the owner of this site";
}

export function contactForm(
  token: string,
  retentionSeconds: number,
  draft: ContactDraft = {},
  error?: string,
  presentation: ContactPresentation = {},
): string {
  const value = (text: string | undefined, max: number): string =>
    escapeHtml((text ?? "").slice(0, max));
  const notice = error
    ? `<p class="notice" role="alert">${escapeHtml(error)}</p>`
    : "";
  const query = presentation.theme ? `?theme=${presentation.theme}` : "";
  const retentionDays = Math.ceil(retentionSeconds / 86400);
  const heading = presentation.owner
    ? `Write to ${escapeHtml(presentation.owner)}`
    : "Write a note";
  return contactPage(
    `<h1>${heading}</h1>${notice}
<p class="introduction">Your note goes privately to ${recipient(presentation)}, who can reply by email. It doesn’t start a chat, and it never becomes part of what this site knows.</p>
<form method="post" action="/contact${query}" accept-charset="UTF-8" aria-describedby="contact-privacy">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="contact-name">Name<input id="contact-name" name="name" autocomplete="name" required maxlength="120" value="${value(draft.name, 120)}"></label>
<label for="contact-email">Email<input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" value="${value(draft.email, 254)}"></label>
<label class="message" for="contact-message"><span>Message <span class="optional">(optional)</span></span><textarea id="contact-message" name="message" rows="5" maxlength="4000">${value(draft.message, 4000)}</textarea></label>
<div class="trap" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off" value=""></label></div>
<button type="submit">Send note</button></form>
<p class="privacy" id="contact-privacy">Your note is kept for ${retentionDays} ${retentionDays === 1 ? "day" : "days"}, then deleted. Deletion can run late if the site is down or has a problem, and backups may keep earlier copies.</p>
<p class="retry">If this form has expired, copy your message first, then <a href="/contact${query}">open a new form</a>.</p>`,
    presentation,
  );
}

/** Saved is what the visitor can be told; the owner's alert is sent separately. */
export function contactThanks(presentation: ContactPresentation = {}): string {
  const to = recipient(presentation);
  return contactPage(
    `<h1>Note saved</h1><p class="introduction">Your note is saved for ${to}, who can reply by email.</p><p>It stays saved even if the alert to ${to} is delayed, so there’s no need to send it again.</p>`,
    presentation,
  );
}

export function contactUnavailable(
  presentation: ContactPresentation = {},
): string {
  return contactPage(
    '<h1>Notes are paused</h1><p role="alert">Notes can’t be received right now. Please try this same form again later.</p>',
    presentation,
  );
}
