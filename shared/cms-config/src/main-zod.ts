// Centralized main-Zod import for CMS frontmatter schema introspection.
// Keep this explicit until CMS schema introspection migrates to a final Zod 4
// or schema-metadata boundary.
export { z } from "@brains/utils/zod";
export type { z as zMain } from "@brains/utils/zod";
