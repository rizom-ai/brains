// Test runner adapter; the candidate binding is also used by standalone scale proofs.
import { afterAll } from "bun:test";
import { retireCanonicalCandidate } from "./turso-canonical-candidate";
export {
  canonicalAssetBindings,
  canonicalTestLifetime,
  joinCanonicalOwners,
} from "./turso-canonical-candidate";

// No timeout override: join App finalizers before retiring their database owners.
afterAll(retireCanonicalCandidate);
