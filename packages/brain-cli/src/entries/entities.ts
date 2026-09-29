/**
 * Layer 3 re-export of the layer 1 authoring surface (`@brains/sdk`).
 *
 * The contract lives in `packages/brain-sdk`; this file exists so the
 * published `@rizom/brain/entities` specifier keeps resolving to the identical
 * symbols. Add exports to the SDK package, never here.
 */

export * from "@brains/sdk/entities";
