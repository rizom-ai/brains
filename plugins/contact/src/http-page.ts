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
.contact-nav{border-bottom:1px solid var(--color-rule);padding:1.25rem clamp(1.5rem,6vw,3rem)}.contact-nav a{font:500 .7rem var(--font-mono);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:var(--color-text-muted)}
main{max-width:46rem;margin:clamp(2.75rem,7vw,5.5rem) auto;padding:0 1.5rem 4rem}.eyebrow{display:block;color:var(--color-accent);font:500 .7rem var(--font-mono);letter-spacing:.2em;text-transform:uppercase}
h1{font-family:var(--font-heading);font-weight:400;font-size:clamp(2.6rem,6vw,4.25rem);line-height:1.04;letter-spacing:-.025em;font-variation-settings:"SOFT" 30,"opsz" 96;margin:1rem 0 1.75rem;overflow-wrap:anywhere}
p{max-width:60ch;color:var(--color-text-muted)}.introduction{font-family:var(--font-heading);font-size:1.2rem;line-height:1.55;font-weight:300}.privacy{font-size:.85rem;line-height:1.65;margin:1.25rem 0}
form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.75rem 1.5rem;margin-block:2rem;border-top:1px solid var(--color-rule-strong);padding-top:2rem}
label{display:grid;gap:.65rem;font:500 .7rem var(--font-mono);letter-spacing:.08em;text-transform:uppercase}.message{grid-column:1/-1}
input,textarea{width:100%;min-width:0;font:400 1rem/1.5 var(--font-sans);color:var(--color-text);background:var(--color-bg-subtle,var(--color-bg));border:1px solid var(--color-border);border-radius:0;padding:.75rem}
textarea{resize:vertical;min-height:9rem}button{grid-column:1/-1;justify-self:start;cursor:pointer;font:500 .75rem var(--font-mono);letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--color-accent);padding:1rem 1.25rem;background:var(--color-accent);color:var(--color-on-accent)}button:hover{background:var(--color-text);color:var(--color-bg);border-color:var(--color-text)}
a{color:var(--color-accent);text-underline-offset:.2em}:focus-visible{outline:2px solid var(--color-accent);outline-offset:4px}.trap{position:absolute;left:-10000px}.notice{border-inline-start:2px solid var(--color-error);padding:1rem 1.25rem;background:var(--color-bg-subtle,var(--color-bg));color:var(--color-text);margin-block:1.5rem}.retry{font-size:.85rem}
@media(max-width:540px){form{grid-template-columns:1fr;gap:1.5rem}main{margin-top:2.75rem}.introduction{font-size:1.1rem}button{width:100%}}
</style></head><body><nav class="contact-nav" aria-label="Site"><a href="/">← Back to the site</a></nav><main><span class="eyebrow">A direct conversation</span>${body}</main></body></html>`;
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
  return contactPage(
    `<h1>Talk to the owner</h1>${notice}
<p class="introduction">Send a private note about what you have in mind. The owner can reply by email. This does not start a chat or add your message to the Brain’s knowledge.</p>
<form method="post" action="/contact${query}" accept-charset="UTF-8" aria-describedby="contact-privacy">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="contact-name">Name<input id="contact-name" name="name" autocomplete="name" required maxlength="120" value="${value(draft.name, 120)}"></label>
<label for="contact-email">Email<input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" value="${value(draft.email, 254)}"></label>
<label class="message" for="contact-message">Anything the owner should know · optional<textarea id="contact-message" name="message" rows="5" maxlength="4000">${value(draft.message, 4000)}</textarea></label>
<div class="trap" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off" value=""></label></div>
<button type="submit">Send request →</button></form>
<p class="privacy" id="contact-privacy">The request expires after ${Math.ceil(retentionSeconds / 86400)} days. Cleanup runs at startup and daily while the app is running; downtime or failures can delay deletion. Backups may retain earlier copies. Saving a request does not confirm notification delivery.</p>
<p class="retry">If this form has expired, copy your message before <a href="/contact${query}">opening a new form</a>.</p>`,
    presentation,
  );
}
