import {
  buildServiceTool,
  type ServiceInputSchema,
  type ServiceSchema,
  type ServiceToolDefinition,
} from "./service-definition-contract";

/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer. No public entry
 * exports it.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

const firstPartyToolName = /^[a-z][a-z0-9_-]*$/u;

/**
 * A tool as `defineTool` declares one, whose local name may also carry an
 * underscore, as a first-party class's tools were named
 * (`atproto-registry_check_contracts`). The public `defineTool` keeps its
 * kebab-case rule.
 */
export function firstPartyTool<
  const TName extends string,
  TInputSchema extends ServiceInputSchema,
  const TOutputSchema extends ServiceSchema,
>(
  definition: Omit<
    ServiceToolDefinition<TName, TInputSchema, TOutputSchema>,
    "kind"
  >,
): ServiceToolDefinition<TName, TInputSchema, TOutputSchema> {
  if (!firstPartyToolName.test(definition.name)) {
    throw new Error(
      `First-party tool name "${definition.name}" must start with a lowercase letter and contain only lowercase letters, numbers, hyphens and underscores`,
    );
  }
  return buildServiceTool(definition);
}
