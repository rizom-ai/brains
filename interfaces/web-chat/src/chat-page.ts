import { join } from "path";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  renderConsoleStripHtml,
  type ConsoleSurface,
} from "@brains/console-theme";
import chatPageStyles from "./chat-page.css" with { type: "text" };
import responsiveShellStyles from "./responsive-shell.css" with { type: "text" };
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };

export const uiAssetPath: string = "/chat/assets/app.js";
export const uiAssetFile: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
  "app.js",
);

export interface ChatPageOptions {
  /** Console-strip doors, derived from the registered web routes. */
  surfaces: ConsoleSurface[];
  /** Sign-out link for the session chip (the page is operator-only). */
  sessionHref: string;
}

export function renderChatPage(options: ChatPageOptions): string {
  // The climate script runs before first paint to apply the console-wide
  // stored preference; the shared sheet supplies the palette both climates
  // resolve from. No webfont link here: the chat page deliberately makes no
  // third-party requests, so the console type ramp falls back to system
  // stacks until fonts are self-hosted.
  return `<!doctype html><html lang="en" data-climate="instrument"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>Brain Chat</title><script>${CONSOLE_CLIMATE_SCRIPT}</script><script>${CONSOLE_PALETTE_SCRIPT}</script><style data-web-chat-styles>${CONSOLE_THEME_CSS}

${chatPageStyles}

${responsiveShellStyles}

${visualRefreshStyles}</style></head><body>${renderConsoleStripHtml(options)}<main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
}
