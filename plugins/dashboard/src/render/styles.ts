/**
 * CSS for the Brain Console dashboard.
 *
 * The palette, type ramp, and console-strip chrome come from the shared
 * @brains/console-theme sheet; this module only appends the dashboard's
 * component and layout rules, which style themselves from --console-*.
 */
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import componentStyles from "./styles/components.css" with { type: "text" };
import responsiveStyles from "./styles/responsive.css" with { type: "text" };

export const DASHBOARD_STYLES: string = `${CONSOLE_THEME_CSS}

${componentStyles}

${responsiveStyles}`;
