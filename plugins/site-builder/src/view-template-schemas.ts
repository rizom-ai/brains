import type { Template } from "@brains/content-generator";

// Site-builder doesn't provide any built-in templates
// All templates should be registered by plugins
export const builtInTemplates: Template[] = [];

export type BuiltInTemplateName = (typeof builtInTemplates)[number]["name"];
