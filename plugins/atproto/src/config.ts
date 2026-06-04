import { z } from "@brains/utils";

export const atprotoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pdsEndpoint: z
    .string()
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

export type AtprotoConfig = z.infer<typeof atprotoConfigSchema>;
export type AtprotoConfigInput = Partial<AtprotoConfig>;
