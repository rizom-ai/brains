import type { ViewTemplate } from "@brains/types";

// Site-builder doesn't provide any built-in view templates
// All templates should be registered by plugins
export const builtInTemplates: ViewTemplate[] = [];

export type BuiltInTemplateName = (typeof builtInTemplates)[number]["name"];
