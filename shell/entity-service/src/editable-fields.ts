import { z } from "@brains/utils/zod";
import { readMetadata } from "@brains/utils/zod-introspect";
import type { FrontmatterSchema } from "./types";

/** Fields Studio shows read-only or leaves off its form: the brain's own. */
const BRAIN_OWNED_WIDGETS = new Set(["provenance", "hidden"]);

function isBrainOwnedField(field: unknown): boolean {
  const widget = readMetadata(field)?.["studioWidget"];
  return typeof widget === "string" && BRAIN_OWNED_WIDGETS.has(widget);
}

/**
 * The fields of a frontmatter schema callers may set: all but those it
 * marks as the brain's own record, `studioWidget: "provenance"` or
 * `"hidden"`, the marks by which Studio shows a field read-only or leaves
 * it off its form. A person and the brain's tools edit the same fields.
 */
export function editableFieldsOf(schema: FrontmatterSchema): FrontmatterSchema {
  return z.object(
    Object.fromEntries(
      Object.entries(schema.shape).filter(
        ([, field]) => !isBrainOwnedField(field),
      ),
    ),
  );
}
