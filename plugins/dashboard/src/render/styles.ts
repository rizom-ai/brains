/**
 * CSS for the Brain Console dashboard.
 *
 * The palette, type ramp, and command palette come from the shared
 * @brains/console-theme sheet. Shared compiled components own chrome, panels,
 * maps, widgets and operator layouts. Only the document reset remains local.
 */
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import foundationStyles from "./styles/foundation.css" with { type: "text" };

export const DASHBOARD_STYLES: string = `${CONSOLE_THEME_CSS}

${foundationStyles}

${operatorViewStylexCSS}`;
