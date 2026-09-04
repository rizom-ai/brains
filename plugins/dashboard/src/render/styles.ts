/**
 * CSS for the Brain Console dashboard.
 *
 * The palette, type ramp, and command palette come from the shared
 * @brains/console-theme sheet; this module owns the anonymous Dashboard
 * masthead and component layout, all styled from --console-*.
 */
import { CONSOLE_THEME_CSS } from "@brains/console-theme";
import { operatorViewRendererStyles } from "@brains/operator-view-react";
import compatibilityStyles from "./styles/compatibility.css" with { type: "text" };
import foundationStyles from "./styles/foundation.css" with { type: "text" };
import mapsStyles from "./styles/maps.css" with { type: "text" };
import overviewStyles from "./styles/overview.css" with { type: "text" };
import operatorViewStyles from "./styles/operator-view.css" with { type: "text" };
import systemStyles from "./styles/system.css" with { type: "text" };
import widgetPrimitiveStyles from "./styles/widget-primitives.css" with { type: "text" };

export const DASHBOARD_STYLES: string = `${CONSOLE_THEME_CSS}

${foundationStyles}

${overviewStyles}

${mapsStyles}

${systemStyles}

${operatorViewStyles}

${operatorViewRendererStyles}

${widgetPrimitiveStyles}

${compatibilityStyles}`;
