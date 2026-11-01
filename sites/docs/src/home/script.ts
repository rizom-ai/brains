import script from "./home.boot.js" with { type: "text" };

/** Served as a real file, since a script-src CSP blocks data: URIs. */
export const DOCS_HOME_SCRIPT_SRC = "/scripts/docs-home.js";

export const docsHomeScript: string = script;
