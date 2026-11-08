import {
  SdkError,
  defineRoute,
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { firstPartyTool } from "@brains/sdk/internal/service-runtime";
import {
  getCanonicalAtprotoLexicon,
  listCanonicalAtprotoLexiconMetadata,
  listCanonicalAtprotoLexicons,
  validateAtprotoRecord,
} from "@brains/atproto-contracts";
import type {
  AtprotoLexicon,
  AtprotoLexiconMetadata,
} from "@brains/atproto-contracts";
import { getErrorMessage } from "@brains/utils/error";

export const atprotoRegistryConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  enabled: z.boolean().default(true),
});

export type AtprotoRegistryConfig = z.output<
  typeof atprotoRegistryConfigSchema
>;
export type AtprotoRegistryConfigInput = z.input<
  typeof atprotoRegistryConfigSchema
>;

export interface AtprotoLexiconRegistryEntry extends AtprotoLexiconMetadata {
  path: string;
}

export interface AtprotoLexiconRegistryIndex {
  lexicons: AtprotoLexiconRegistryEntry[];
}

const BASE_PATH = "/atproto/lexicons";

/** The registry's manifest: every canonical lexicon and where it is served. */
export function getIndex(): AtprotoLexiconRegistryIndex {
  return {
    lexicons: listCanonicalAtprotoLexiconMetadata().map((metadata) => ({
      ...metadata,
      path: `${BASE_PATH}/${metadata.id}.json`,
    })),
  };
}

export function getLexicon(id: string): AtprotoLexicon | undefined {
  return getCanonicalAtprotoLexicon(id);
}

// The registry serves canonical documents whose vocabulary
// @brains/atproto-contracts owns, and serves them unchanged: an object schema
// here would be a second source of truth and would strip what it does not
// name. These pass the value through and check the shape that matters.
const indexSchema: z.ZodType<AtprotoLexiconRegistryIndex> =
  z.custom<AtprotoLexiconRegistryIndex>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "lexicons" in value &&
      Array.isArray(value.lexicons),
    { message: "Expected a lexicon registry index" },
  );
const lexiconSchema: z.ZodType<AtprotoLexicon> = z.custom<AtprotoLexicon>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string",
  { message: "Expected a canonical lexicon document" },
);
const metadataListSchema: z.ZodType<AtprotoLexiconMetadata[]> = z.custom<
  AtprotoLexiconMetadata[]
>((value) => Array.isArray(value), { message: "Expected lexicon metadata" });

/** An unknown NSID is named back, bounded to what a public message carries. */
const MAX_NAMED_NSID = 256;

/**
 * The canonical Rizom AT Protocol lexicon registry: the `ai.rizom.brain.*`
 * lexicons and their manifest, served publicly, and tools to list, validate
 * against and check them.
 */
const atprotoRegistryPackage: ServicePackageDefinition<
  typeof atprotoRegistryConfigSchema
> = defineServicePlugin(
  {
    id: "atproto-registry",
    config: atprotoRegistryConfigSchema,
  },
  {
    routes: ({ config }) =>
      config.enabled
        ? [
            defineRoute({
              method: "GET",
              path: `${BASE_PATH}/index.json`,
              security: { kind: "public" },
              response: indexSchema,
              handle: () => getIndex(),
            }),
            ...listCanonicalAtprotoLexicons().map((lexicon) =>
              defineRoute({
                method: "GET",
                path: `${BASE_PATH}/${lexicon.id}.json`,
                security: { kind: "public" },
                response: lexiconSchema,
                handle: () => lexicon,
              }),
            ),
          ]
        : [],

    // The class's snake-case names, which evals and agents call them by.
    tools: () => [
      firstPartyTool({
        name: "list_lexicons",
        description: "List canonical Rizom AT Protocol lexicons.",
        input: z.object({}),
        output: indexSchema,
        sideEffects: "none",
        execute: () => getIndex(),
      }),
      firstPartyTool({
        name: "validate_lexicon",
        description:
          "Validate a record payload against a canonical Rizom AT Protocol lexicon.",
        input: z.strictObject({
          nsid: z.string().describe("Canonical lexicon NSID"),
          record: z
            .record(z.string(), z.unknown())
            .describe("Record payload to validate"),
        }),
        output: z.object({
          valid: z.boolean(),
          error: z.string().optional(),
        }),
        sideEffects: "none",
        execute: ({ input }) => {
          const lexicon = getLexicon(input.nsid);
          if (!lexicon) {
            throw new SdkError("not_found", {
              publicMessage: `Unknown AT Protocol lexicon: ${input.nsid.slice(0, MAX_NAMED_NSID)}`,
            });
          }
          try {
            validateAtprotoRecord(lexicon, input.record);
            return { valid: true };
          } catch (error) {
            return {
              valid: false,
              error: getErrorMessage(error, "Invalid record"),
            };
          }
        },
      }),
      firstPartyTool({
        name: "check_contracts",
        description:
          "Check that canonical Rizom AT Protocol lexicon contracts are available.",
        input: z.object({}),
        output: z.object({
          lexiconCount: z.number(),
          nsids: z.array(z.string()),
          metadata: metadataListSchema,
        }),
        sideEffects: "none",
        execute: () => ({
          lexiconCount: listCanonicalAtprotoLexicons().length,
          nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
          metadata: listCanonicalAtprotoLexiconMetadata(),
        }),
      }),
    ],
  },
);

export default atprotoRegistryPackage;
