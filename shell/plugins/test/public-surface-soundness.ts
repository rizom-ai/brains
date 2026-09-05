import type * as Public from "../src/public/types";
import type * as Interfaces from "../src/interfaces";

/**
 * `src/public/types.ts` is the authoring surface published as
 * `@rizom/brain/plugins`, a deliberately narrower restatement of the runtime
 * types. The invariant is one-directional: the runtime must satisfy what the
 * SDK promises; narrowing stays legal.
 *
 * For the five plugin contexts that invariant is enforced structurally — each
 * internal context interface `extends` its published counterpart (see
 * `src/base/context.ts`, `src/service/context.ts`, `src/entity/context.ts`,
 * `src/interface/context.ts`), so a published member the runtime lacks fails
 * to compile at the internal declaration.
 *
 * `Plugin` cannot use that mechanism: the runtime `Plugin` is a type alias
 * over `z.output<typeof pluginMetadataSchema>`, and type aliases cannot carry
 * an extends clause. This assertion covers that one remaining pair.
 */

type RuntimeSatisfiesPublic<Runtime extends Published, Published> = Runtime;

type _Plugin = RuntimeSatisfiesPublic<Interfaces.Plugin, Public.Plugin>;

/**
 * Keeps the assertion above from being reported as an unused declaration.
 *
 * This file is checked by `bun run typecheck`, not by `bun test`: the
 * assertion is the type alias above, and there is nothing to run. A reader
 * who lands here from a typecheck error has found the guard; the rest of the
 * invariant lives in the contexts' extends clauses.
 */
export type PublicSurfaceAssertions = [_Plugin];
