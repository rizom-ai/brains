/** @jsxImportSource preact */
import { render } from "preact-render-to-string";
import { DashboardDocument } from "./render/dashboard-document";
import type { DashboardRenderInput } from "./render/types";

export type { DashboardRenderInput } from "./render/types";

export function renderDashboardPageHtml(input: DashboardRenderInput): string {
  return `<!doctype html>\n${render(<DashboardDocument input={input} />)}`;
}
