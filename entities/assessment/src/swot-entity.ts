import {
  defineEntity,
  type EntityDefinition,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  storedDocumentCodec,
  storedFormCodec,
  bodyUnderHeader,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  parseSwotContent,
  swotInCurrentShape,
  swotInNextForm,
  swotNextHeaderSchema,
} from "./lib/swot-content";
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

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

type SwotDefinition = EntityDefinition<"swot", typeof swotMetadataSchema>;

// A SWOT is all header, as the swot adapter wrote it: read as its stored
// document, its metadata the time it was derived.
const storedSwot = storedDocumentCodec<
  typeof swotFrontmatterSchema,
  typeof swotMetadataSchema
>({
  header: swotFrontmatterSchema,
  deriveMetadata: ({ derivedAt }) => ({ derivedAt }),
  // The swot adapter wrote a hand-added body from the line under its
  // header; a SWOT in the next form reads in the current shape.
  prepare: (document) => swotInCurrentShape(bodyUnderHeader(document)),
});

/**
 * The current shape a write states: the document's whole header, the time
 * the record was derived, and the text an author added.
 */
function currentShape(
  content: string,
  derivedAt: string,
): { content: string; frontmatter: Record<string, unknown> } {
  const parsed = parseMarkdown(content);
  const document = swotInCurrentShape({
    content: parsed.content,
    frontmatter: parsed.frontmatter,
  });
  return {
    content: document.content,
    frontmatter: { ...document.frontmatter, derivedAt },
  };
}

/**
 * Read as its stored document in either form, all header or the quadrants
 * in the body; the quadrants are written in the body.
 */
const swotMarkdown = storedFormCodec<typeof swotMetadataSchema>({
  decode: storedSwot.decode,
  encode: ({ content, metadata }) =>
    swotInNextForm(currentShape(content, metadata.derivedAt)),
  header: swotNextHeaderSchema,
  oldHeader: swotFrontmatterSchema,
  // The quadrants a file read in the old form opens with.
  places: [
    ["strengths", "weaknesses", "opportunities", "threats", "derivedAt"],
  ],
  readAsWritten: true,
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
 * The swot type with the rule that derives it, scheduled or not: a SWOT
 * analysis of what the brain and its network can do, derived from its
 * agents and skills. Its `deriveSwot` eval measures the rule against the
 * brain as it stands, scheduled or not.
 */
function swotDefinition(rule: ProjectionRule): SwotDefinition {
  const definition: SwotDefinition = defineEntity({
    type: "swot",
    classification: "system",
    purpose:
      "A SWOT analysis of strengths, weaknesses, opportunities, and threats.",
    metadata: swotMetadataSchema,
    markdown: swotMarkdown,
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    projectionRules: [rule],
    evals: {
      deriveSwot: async (_input, context) =>
        swotWritten(
          await entityRuntime(context).runProjectionRule(
            SWOT_DERIVATION_RULE_ID,
          ),
        ),
    },
    dashboardWidgets: (context) => [swotWidgetOf(context, definition)],
  });
  return definition;
}

/** The SWOT, derived by AI from the brain's agents and skills. */
export const derivedSwot: SwotDefinition = swotDefinition(
  createSwotProjectionRule(),
);

/**
 * The SWOT, with derivation off: its rule names no sources, so nothing
 * derives it in the background, and only its eval runs it.
 */
export const swot: SwotDefinition = swotDefinition(
  createSwotProjectionRule({ scheduled: false }),
);
