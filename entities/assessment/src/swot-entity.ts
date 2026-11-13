import {
  defineEntity,
  type EntityDefinition,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  storedDocumentCodec,
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { parseSwotContent } from "./lib/swot-content";
import {
  SWOT_DERIVATION_RULE_ID,
  createSwotProjectionRule,
} from "./lib/swot-projection";
import { swotWidgetOf } from "./lib/swot-widget";
import {
  swotFrontmatterSchema,
  swotMetadataSchema,
  type SwotFrontmatter,
} from "./schemas/swot";

type SwotDefinition = EntityDefinition<"swot", typeof swotMetadataSchema>;

// A SWOT is all header, as the swot adapter wrote it: read as its stored
// document, its metadata the time it was derived.
const storedSwot = storedDocumentCodec<
  typeof swotFrontmatterSchema,
  typeof swotMetadataSchema
>({
  header: swotFrontmatterSchema,
  deriveMetadata: ({ derivedAt }) => ({ derivedAt }),
  readAsWritten: true,
});
// The swot adapter wrote a hand-added body from the line under its header.
// The codec stays the one storedDocumentCodec made, which is what reads as
// written.
const storedDecode = storedSwot.decode;
Object.assign(storedSwot, {
  decode: (document: Parameters<typeof storedDecode>[0]) =>
    storedDecode({
      ...document,
      content: document.content.replace(/^\n+/u, ""),
    }),
});

/**
 * The SWOT the swot-derivation rule writes, from what a run of the rule
 * would write: its record's quadrants and the time it was derived.
 */
export function swotWritten(
  intents: readonly ProjectionWriteIntent[],
): SwotFrontmatter {
  const written = intents.flatMap((intent) =>
    intent.operation === "upsert" && intent.entity.entityType === "swot"
      ? [intent.entity]
      : [],
  )[0];
  if (!written) throw new Error("The swot-derivation rule wrote no SWOT");
  return parseSwotContent(written.content).frontmatter;
}

/**
 * The swot type, with or without the rule that derives it: a SWOT
 * analysis of what the brain and its network can do, derived from its
 * agents and skills. Its `deriveSwot` eval measures the production rule
 * against the brain as it stands.
 */
export function swotDefinition(
  rule: ProjectionRule | undefined,
): SwotDefinition {
  const definition: SwotDefinition = writesInDocumentOrder(
    withFrontmatterSchema(
      defineEntity({
        type: "swot",
        classification: "system",
        purpose:
          "A SWOT analysis of strengths, weaknesses, opportunities, and threats.",
        metadata: swotMetadataSchema,
        markdown: storedSwot,
        config: { projectionSource: false, projectionSourceRole: "excluded" },
        ...(rule && { projectionRules: [rule] }),
        evals: {
          deriveSwot: async (_input, context) =>
            swotWritten(
              await entityRuntime(context).runProjectionRule(
                SWOT_DERIVATION_RULE_ID,
              ),
            ),
        },
        dashboardWidgets: (context) => [swotWidgetOf(context, definition)],
      }),
      // The header the swot adapter declared: Studio's editor reads it as
      // the type's frontmatter.
      swotFrontmatterSchema,
    ),
  );
  return definition;
}

/** The SWOT, derived by AI from the brain's agents and skills. */
export const derivedSwot: SwotDefinition = swotDefinition(
  createSwotProjectionRule(),
);

/** The SWOT, with derivation off: none is derived. */
export const swot: SwotDefinition = swotDefinition(undefined);
