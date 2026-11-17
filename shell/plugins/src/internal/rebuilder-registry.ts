import type { PluginPackageDefinition } from "../package-definition";

/**
 * Internal, first-party only: how the definitions of one family are rebuilt
 * with more first-party declarations, shared by the service wrappers and the
 * interface wrappers so each keeps only what its family declares.
 */
export interface RebuilderRegistry<TDeclarations> {
  /** Called by the family's define function: how its result is rebuilt. */
  register(
    definition: PluginPackageDefinition,
    declarations: TDeclarations,
    rebuild: (declarations: TDeclarations) => PluginPackageDefinition,
  ): void;
  /**
   * The definition rebuilt with what `add` adds to its declarations. Refused
   * for a definition the family's define function did not return.
   */
  rebuildWith(
    definition: PluginPackageDefinition,
    wrapper: string,
    add: (declarations: TDeclarations) => TDeclarations,
  ): PluginPackageDefinition;
}

/** A registry for the definitions `defineName` returns. */
export function createRebuilderRegistry<TDeclarations>(
  defineName: string,
): RebuilderRegistry<TDeclarations> {
  const rebuilders = new WeakMap<
    PluginPackageDefinition,
    {
      readonly declarations: TDeclarations;
      rebuild(declarations: TDeclarations): PluginPackageDefinition;
    }
  >();
  return {
    register: (definition, declarations, rebuild): void => {
      rebuilders.set(definition, { declarations, rebuild });
    },
    rebuildWith: (definition, wrapper, add): PluginPackageDefinition => {
      const entry = rebuilders.get(definition);
      if (!entry) {
        throw new Error(
          `${wrapper} takes a definition ${defineName} returned; "${definition.id}" is not one`,
        );
      }
      return entry.rebuild(add(entry.declarations));
    },
  };
}
