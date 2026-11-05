import { ServicePlugin, type ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInClient, type LinkedInFetch } from "./lib/linkedin-client";
import { ProfileImport } from "./lib/profile-import";
import { registerLinkedInWorkspace } from "./workspace";
import packageJson from "../package.json";

const linkedInImportConfigSchema: z.ZodObject<{
  accessToken: z.ZodOptional<z.ZodString>;
}> = z.object({
  accessToken: z
    .string()
    .optional()
    .describe("LinkedIn member token with r_dma_portability_3rd_party"),
});

type LinkedInImportConfig = z.output<typeof linkedInImportConfigSchema>;
type LinkedInImportConfigInput = z.input<typeof linkedInImportConfigSchema>;

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch;
}

/**
 * Imports the owner's LinkedIn profile into the anchor profile from a Studio
 * workspace only the Anchor sees. Inert without an access token.
 */
export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;

  constructor(
    config: LinkedInImportConfigInput = {},
    deps: LinkedInImportDeps = {},
  ) {
    super("linkedin-import", packageJson, config, linkedInImportConfigSchema);
    this.deps = deps;
  }

  protected override async onRegistrationComplete(
    context: ServicePluginContext,
  ): Promise<void> {
    const accessToken = this.config.accessToken?.trim();
    if (!accessToken) return;
    await registerLinkedInWorkspace(
      context,
      new ProfileImport(
        new LinkedInClient(accessToken, this.deps.fetch),
        context.entityService,
      ),
    );
  }
}

export function linkedInImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
