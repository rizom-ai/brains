/**
 * CSS for the operator-console dashboard.
 *
 * Dashboard styles are split into token bridges and component/layout rules so
 * the page can consume shared brand variables without coupling to a site build.
 */
import { DASHBOARD_COMPONENT_STYLES } from "./styles/components";
import { DASHBOARD_TOKENS } from "./styles/tokens";

export const DASHBOARD_STYLES = `${DASHBOARD_TOKENS}
${DASHBOARD_COMPONENT_STYLES}`;
