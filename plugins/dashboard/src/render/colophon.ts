import { escapeHtml } from "@brains/utils";
import type { AppInfo } from "@brains/plugins";

export function renderColophon(title: string, appInfo: AppInfo): string {
  return `<footer class="colophon">
    <span>${escapeHtml(title)} · operator console</span>
    <span>v${escapeHtml(appInfo.version)}</span>
  </footer>`;
}
