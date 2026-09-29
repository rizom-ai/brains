import { join } from "path";
import { escapeHtml } from "@brains/utils/string-utils";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_THEME_CSS,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import guestPageStyles from "./guest-page.css" with { type: "text" };

export { guestPageStyles };

export const uiAssetDirectory: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
);
export const guestPageAssetPath: string = "/ask/assets/ask.js";
export const guestPageStylesheetPath: string = "/ask/assets/ask.css";

export function renderGuestChatPage(options: {
  apiPath: string;
  themeCSS?: string | undefined;
  name?: string;
  siteLabel?: string;
}): string {
  const name = escapeHtml(options.name ?? "the Brain");
  const label = escapeHtml(options.siteLabel ?? "Brain");
  // Apps without a generated site page get a headerless fallback. The site,
  // when present, owns its full layout, theme controls and navigation.
  return `<!doctype html><html lang="en" data-climate="instrument" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ask ${name}</title><script>${CONSOLE_CLIMATE_SCRIPT}</script><style>${resolveConsoleThemeCSS(options.themeCSS, { imports: "remove" })}\n${CONSOLE_THEME_CSS}\n${guestPageStyles}</style><link rel="stylesheet" href="${guestPageStylesheetPath}"></head><body class="guest-page"><main data-web-chat-root data-guest-chat data-guest-name="${name}" data-guest-label="${label}" data-chat-api-path="${escapeHtml(options.apiPath)}"><p>Connecting to public Ask…</p><noscript>JavaScript is needed to ask a question. No question has been sent.</noscript></main><script type="module" src="${guestPageAssetPath}"></script></body></html>`;
}
