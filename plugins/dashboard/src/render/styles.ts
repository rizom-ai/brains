/**
 * CSS for the Brain Console dashboard.
 *
 * The palette, type ramp, and console-strip chrome come from the shared
 * @brains/console-theme sheet; this module only appends the dashboard's
 * component and layout rules, which style themselves from --console-*.
 */
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import compatibilityStyles from "./styles/compatibility.css" with { type: "text" };
import foundationStyles from "./styles/foundation.css" with { type: "text" };
import overviewStyles from "./styles/overview.css" with { type: "text" };
import systemStyles from "./styles/system.css" with { type: "text" };
import widgetPrimitiveStyles from "./styles/widget-primitives.css" with { type: "text" };

export const DASHBOARD_STYLES: string = `${CONSOLE_THEME_CSS}

${foundationStyles}

${overviewStyles}

${systemStyles}

${widgetPrimitiveStyles}

${compatibilityStyles}`;
