import type { Tool, WebRouteDefinition } from "@brains/plugins";
import { ServicePlugin, createTool, jsonResponse } from "@brains/plugins";
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
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
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
      ...listCanonicalAtprotoLexicons().map((lexicon): WebRouteDefinition => ({
        path: `${BASE_PATH}/${lexicon.id}.json`,
        method: "GET",
        public: true,
        handler: (): Response => jsonResponse(lexicon),
      })),
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
    return createTool(
      this.id,
      "list_lexicons",
      "List canonical Rizom AT Protocol lexicons.",
      z.object({}),
      async () => ({ success: true, data: this.getIndex() }),
    );
  }

  private createValidateLexiconTool(): Tool {
    return createTool(
      this.id,
      "validate_lexicon",
      "Validate a record payload against a canonical Rizom AT Protocol lexicon.",
      z.strictObject({
        nsid: z.string().describe("Canonical lexicon NSID"),
        record: z
          .record(z.string(), z.unknown())
          .describe("Record payload to validate"),
      }),
      async (input) => {
        const lexicon = this.getLexicon(input.nsid);
        if (!lexicon) {
          return {
            success: false,
            error: `Unknown AT Protocol lexicon: ${input.nsid}`,
          };
        }

        let data: { valid: boolean; error?: string };
        try {
          validateAtprotoRecord(lexicon, input.record);
          data = { valid: true };
        } catch (error) {
          data = {
            valid: false,
            error: getErrorMessage(error, "Invalid record"),
          };
        }
        return { success: true, data };
      },
    );
  }

  private createCheckContractsTool(): Tool {
    return createTool(
      this.id,
      "check_contracts",
      "Check that canonical Rizom AT Protocol lexicon contracts are available.",
      z.object({}),
      async () => ({
        success: true,
        data: {
          lexiconCount: listCanonicalAtprotoLexicons().length,
          nsids: listCanonicalAtprotoLexicons().map((lexicon) => lexicon.id),
          metadata: listCanonicalAtprotoLexiconMetadata(),
        },
      }),
    );
  }
}

export function atprotoRegistryPlugin(
  config: AtprotoRegistryConfigInput = {},
): AtprotoRegistryPlugin {
  return new AtprotoRegistryPlugin(config);
}

export const plugin: typeof atprotoRegistryPlugin = atprotoRegistryPlugin;
