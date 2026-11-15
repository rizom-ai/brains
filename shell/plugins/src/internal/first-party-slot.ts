/**
 * Internal, first-party only: the slot a first-party wrapper declares beside
 * a public definition, shared by the interface wrappers and the service
 * wrappers so neither reaches into the other.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime,
 * whose wrappers a first-party service also uses).
 */

/**
 * What a first-party slot is given once: the parsed config and the state
 * setup returned, with the interface or service runtime attached
 * (`interfaceRuntime(context)`, `serviceRuntime(context)`). The slot names
 * the state its definition's setup returns.
 */
export interface FirstPartySlotContext<TConfig, TState> {
  readonly config: TConfig;
  readonly state: TState;
}

/**
 * A slot as the runtime keeps it, whatever config and state it declared: the
 * runtime hands it the config its schema parsed and the state its setup
 * returned, which is what the slot declares it reads. A method, so a slot
 * declared over its own config and state is one.
 */
export interface FirstPartySlot<TResult> {
  run(context: FirstPartySlotContext<unknown, unknown>): TResult;
}
