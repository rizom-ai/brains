import type { Tool, ToolResponse, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
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
import { z as zConfig } from "@brains/utils/zod";
import { z } from "@brains/utils/zod-v4";
import packageJson from "../package.json";

export const atprotoRegistryConfigSchema = zConfig.object({
  enabled: zConfig.boolean().default(true),
});

export type AtprotoRegistryConfig = zConfig.output<
  typeof atprotoRegistryConfigSchema
>;
export type AtprotoRegistryConfigInput = zConfig.input<
  typeof atprotoRegistryConfigSchema
>;

export interface AtprotoLexiconRegistryEntry extends AtprotoLexiconMetadata {
  path: string;
}

export interface AtprotoLexiconRegistryIndex {
  lexicons: AtprotoLexiconRegistryEntry[];
}

const BASE_PATH = "/atproto/lexicons";

const validateLexiconInputSchema = z.strictObject({
  nsid: z.string(),
  record: z.record(z.string(), z.unknown()),
});

function jsonResponse(value: unknown): Response {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
}

export class AtprotoRegistryPlugin extends ServicePlugin<
  AtprotoRegistryConfig,
  AtprotoRegistryConfigInput
> {
  constructor(config: AtprotoRegistryConfigInput = {}) {
    super("atproto-registry", packageJson, config, atprotoRegistryConfigSchema);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    if (!this.config.enabled) return [];

    return [
      {
        path: `${BASE_PATH}/index.json`,
        method: "GET",
        public: true,
        handler: (): Response => jsonResponse(this.getIndex()),
      },
      ...listCanonicalAtprotoLexicons().map(
        (lexicon): WebRouteDefinition => ({
          path: `${BASE_PATH}/${lexicon.id}.json`,
          method: "GET",
          public: true,
          handler: (): Response => jsonResponse(lexicon),
        }),
      ),
    ];
  }

  getIndex(): AtprotoLexiconRegistryIndex {
    return {
      lexicons: listCanonicalAtprotoLexiconMetadata().map((metadata) => ({
        ...metadata,
        path: `${BASE_PATH}/${metadata.id}.json`,
      })),
    };
  }

  getLexicon(id: string): AtprotoLexicon | undefined {
    return getCanonicalAtprotoLexicon(id);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      this.createListLexiconsTool(),
      this.createValidateLexiconTool(),
      this.createCheckContractsTool(),
    ];
  }

  private createListLexiconsTool(): Tool {
    return {
      name: `${this.id}_list_lexicons`,
      description: "List canonical Rizom AT Protocol lexicons.",
      inputSchema: {},
      handler: async (): Promise<ToolResponse> => ({
        success: true,
        data: this.getIndex(),
      }),
    };
  }

  private createValidateLexiconTool(): Tool {
    return {
      name: `${this.id}_validate_lexicon`,
      description:
        "Validate a record payload against a canonical Rizom AT Protocol lexicon.",
      inputSchema: {
        nsid: zConfig.string().describe("Canonical lexicon NSID"),
        record: zConfig
          .record(zConfig.unknown())
          .describe("Record payload to validate"),
      },
      handler: async (input): Promise<ToolResponse> => {
        const parsed = validateLexiconInputSchema.safeParse(input);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid input: ${parsed.error.message}`,
          };
        }

        const lexicon = this.getLexicon(parsed.data.nsid);
        if (!lexicon) {
          return {
            success: false,
            error: `Unknown AT Protocol lexicon: ${parsed.data.nsid}`,
          };
        }

        try {
          validateAtprotoRecord(lexicon, parsed.data.record);
          return { success: true, data: { valid: true } };
        } catch (error) {
          return {
            success: true,
            data: {
              valid: false,
              error: error instanceof Error ? error.message : "Invalid record",
            },
          };
        }
      },
    };
  }

  private createCheckContractsTool(): Tool {
    return {
      name: `${this.id}_check_contracts`,
      description:
        "Check that canonical Rizom AT Protocol lexicon contracts are available.",
      inputSchema: {},
      handler: async (): Promise<ToolResponse> => ({
        success: true,
        data: {
          lexiconCount: listCanonicalAtprotoLexicons().length,
          nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
          metadata: listCanonicalAtprotoLexiconMetadata(),
        },
      }),
    };
  }
}

export function atprotoRegistryPlugin(
  config: AtprotoRegistryConfigInput = {},
): AtprotoRegistryPlugin {
  return new AtprotoRegistryPlugin(config);
}

export const plugin = atprotoRegistryPlugin;
