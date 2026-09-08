/**
 * CSS for the Brain Console dashboard.
 *
 * The palette, type ramp, and command palette come from the shared
 * @brains/console-theme sheet. Shared compiled components own chrome and panel
 * framing; this module retains unmigrated content layouts using --console-*.
 */
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import {
  operatorViewRendererStyles,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
import compatibilityStyles from "./styles/compatibility.css" with { type: "text" };
import foundationStyles from "./styles/foundation.css" with { type: "text" };
import mapsStyles from "./styles/maps.css" with { type: "text" };
import operatorViewStyles from "./styles/operator-view.css" with { type: "text" };
import widgetPrimitiveStyles from "./styles/widget-primitives.css" with { type: "text" };

export const DASHBOARD_STYLES: string = `${CONSOLE_THEME_CSS}

${foundationStyles}

${mapsStyles}

${operatorViewStyles}

${operatorViewRendererStyles}
${operatorViewStylexCSS}

${widgetPrimitiveStyles}

${compatibilityStyles}`;
