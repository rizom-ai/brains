import { join } from "path";
import chatPageStyles from "./chat-page.css" with { type: "text" };

export const uiAssetPath: string = "/chat/assets/app.js";
export const uiAssetFile: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
  "app.js",
);

export function renderChatPage(): string {
  // Inline theme-init script runs before first paint to set
  // data-theme on <html> based on a stored choice or prefers-color-scheme.
  // The chat tokens key off this attribute (see chatPageStyles).
  const themeInit = `(function(){try{var s=localStorage.getItem('brain:theme');var p=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',s||p);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
  return `<!doctype html><html lang="en" data-theme="dark" data-theme-profile="product"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Brain Chat</title><script>${themeInit}</script><style data-web-chat-styles>${chatPageStyles}</style></head><body><main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
}
