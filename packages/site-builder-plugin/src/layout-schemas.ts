import type { LayoutDefinition } from "@brains/types";

// Site-builder doesn't provide any built-in layouts
// All layouts should be registered by plugins
export const builtInLayouts: LayoutDefinition[] = [];

export type BuiltInLayoutName = (typeof builtInLayouts)[number]["name"];
