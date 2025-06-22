import type { LayoutDefinition } from "@brains/types";
import { z } from "zod";

// Generic object schema for fallback layout
export const ObjectLayoutSchema = z.record(z.unknown());

// Minimal built-in layout definitions - site-builder only provides a fallback
export const builtInLayouts: LayoutDefinition[] = [
  {
    name: "object",
    schema: ObjectLayoutSchema,
    component: "@brains/site-builder/layouts/object.astro",
    description: "Generic object renderer (fallback layout)",
  },
];

export type BuiltInLayoutName = (typeof builtInLayouts)[number]["name"];
