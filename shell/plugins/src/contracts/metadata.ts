import { z } from "zod";

/**
 * Best-effort extension metadata carried across public DTO boundaries.
 *
 * Individual keys are not stable public API. When a metadata value becomes a
 * documented contract, hoist it to a typed top-level field on the owning DTO
 * schema and keep this bag only as optional extension data.
 */
export const ExtensionMetadataSchema = z.record(z.unknown());

export type ExtensionMetadata = z.infer<typeof ExtensionMetadataSchema>;
