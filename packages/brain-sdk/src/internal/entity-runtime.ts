/**
 * Internal, first-party only: runtime capabilities a first-party entity
 * definition reaches from the callback context it was handed, through
 * `entityRuntime(context)`, and the entity-text helpers its create routes
 * read a writer's text with. No public entry exports this module; the
 * public context types never name what it reaches.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-entity-runtime).
 */

export { entityRuntime, type EntityRuntime } from "@brains/plugins";
export {
  checkEntityText,
  entityTextError,
  readEntityText,
  statedDateSchema,
  type EntityTextResult,
} from "@brains/plugins";
