/** @jsxImportSource react */
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardDocument } from "./render/dashboard-document";
import type { DashboardRenderInput } from "./render/types";

export type { DashboardRenderInput } from "./render/types";

export function renderDashboardPageHtml(input: DashboardRenderInput): string {
  return `<!doctype html>\n${renderToStaticMarkup(<DashboardDocument input={input} />)}`;
}
