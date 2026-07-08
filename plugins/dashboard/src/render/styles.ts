/**
 * CSS for the operator-console dashboard.
 *
 * Dashboard styles are split into token bridges and component/layout rules so
 * the page can consume shared brand variables without coupling to a site build.
 */
import componentStyles from "./styles/components.css" with { type: "text" };
import { DASHBOARD_TOKENS } from "./styles/tokens";

export const DASHBOARD_STYLES: string = `${DASHBOARD_TOKENS}

${componentStyles}`;
