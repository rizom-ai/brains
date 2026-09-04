import {
  defineRoute,
  defineServicePlugin,
  defineTool,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
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

export interface AtprotoRegistryConfig {
  enabled: boolean;
}

export interface AtprotoRegistryConfigInput {
  enabled?: boolean | undefined;
}

export const atprotoRegistryConfigSchema: z.ZodType<
  AtprotoRegistryConfig,
  AtprotoRegistryConfigInput
> = z.object({
  enabled: z.boolean().default(true),
});

export interface AtprotoLexiconRegistryEntry extends AtprotoLexiconMetadata {
  path: string;
}

export interface AtprotoLexiconRegistryIndex {
  lexicons: AtprotoLexiconRegistryEntry[];
}

const BASE_PATH = "/atproto/lexicons";

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

// Responses are canonical documents whose vocabulary the contracts package
// owns; re-describing them in zod here would be a second source of truth
// waiting to drift. The schemas are typed tripwires: they assert the
// invariant that matters and keep the contract types exact.
const indexResponseSchema: z.ZodType<AtprotoLexiconRegistryIndex> =
  z.custom<AtprotoLexiconRegistryIndex>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "lexicons" in value &&
      Array.isArray(value.lexicons),
    { message: "Expected a lexicon registry index" },
  );
const lexiconResponseSchema: z.ZodType<AtprotoLexicon> =
  z.custom<AtprotoLexicon>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      typeof value.id === "string",
    { message: "Expected a canonical lexicon document" },
  );
const metadataListSchema: z.ZodType<AtprotoLexiconMetadata[]> = z.custom<
  AtprotoLexiconMetadata[]
>((value) => Array.isArray(value), {
  message: "Expected lexicon metadata",
});

const atprotoRegistryPackage: ServicePackageDefinition<
  typeof atprotoRegistryConfigSchema
> = defineServicePlugin({
  id: "atproto-registry",
  config: atprotoRegistryConfigSchema,

  routes: ({ config }) =>
    config.enabled
      ? [
          defineRoute({
            method: "GET",
            path: `${BASE_PATH}/index.json`,
            security: { kind: "public" },
            response: indexResponseSchema,
            handle: () => getIndex(),
          }),
          ...listCanonicalAtprotoLexicons().map((lexicon) =>
            defineRoute({
              method: "GET",
              path: `${BASE_PATH}/${lexicon.id}.json`,
              security: { kind: "public" },
              response: lexiconResponseSchema,
              handle: () => lexicon,
            }),
          ),
        ]
      : [],

  tools: () => [
    defineTool({
      name: "list-lexicons",
      description: "List canonical Rizom AT Protocol lexicons.",
      input: z.object({}),
      output: indexResponseSchema,
      execute: async () => getIndex(),
    }),
    defineTool({
      name: "validate-lexicon",
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
      execute: async ({ input }) => {
        const lexicon = getLexicon(input.nsid);
        if (!lexicon) {
          throw new Error(`Unknown AT Protocol lexicon: ${input.nsid}`);
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
    defineTool({
      name: "check-contracts",
      description:
        "Check that canonical Rizom AT Protocol lexicon contracts are available.",
      input: z.object({}),
      output: z.object({
        lexiconCount: z.number(),
        nsids: z.array(z.string()),
        metadata: metadataListSchema,
      }),
      execute: async () => ({
        lexiconCount: listCanonicalAtprotoLexicons().length,
        nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
        metadata: listCanonicalAtprotoLexiconMetadata(),
      }),
    }),
  ],
});

export default atprotoRegistryPackage;
