import { z } from "@brains/utils/zod-v4";

export interface AtprotoConfig {
  enabled: boolean;
  pdsEndpoint: string;
  identifier?: string | undefined;
  repoDid?: string | undefined;
  appPassword?: string | undefined;
  anchorDid?: string | undefined;
  brainDid?: string | undefined;
}

export interface AtprotoConfigInput {
  enabled?: boolean | undefined;
  pdsEndpoint?: string | undefined;
  identifier?: string | undefined;
  repoDid?: string | undefined;
  appPassword?: string | undefined;
  anchorDid?: string | undefined;
  brainDid?: string | undefined;
}

export const atprotoConfigSchema: z.ZodType<AtprotoConfig, AtprotoConfigInput> =
  z.object({
    enabled: z.boolean().default(true),
    pdsEndpoint: z
      .url()
      .default("https://bsky.social")
      .describe("AT Protocol PDS service endpoint"),
    identifier: z
      .string()
      .optional()
      .describe("PDS login identifier, usually a handle or account DID"),
    repoDid: z
      .string()
      .optional()
      .describe("DID of the PDS repo that owns records"),
    appPassword: z
      .string()
      .optional()
      .describe(
        "App password for prototype authentication; supply via ${ENV_VAR} interpolation, never a committed literal",
      ),
    anchorDid: z
      .string()
      .optional()
      .describe(
        "Optional human/operator DID referenced from records; defaults to did:web:<site-host>:anchor when omitted",
      ),
    brainDid: z
      .string()
      .optional()
      .describe(
        "Optional public brain DID referenced from records; defaults to did:web:<site-host> when omitted",
      ),
  });
