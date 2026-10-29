import script from "./guide-page.boot.js" with { type: "text" };

/** Served as a real file (template staticAssets), since a script-src CSP blocks data: URIs. */
export const GUIDE_PAGE_SCRIPT_SRC = "/scripts/guide-page.js";

export const guidePageScript: string = script;
